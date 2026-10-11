import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RedemptionService } from './redemption.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DistributedLockService } from '../../infrastructure/redis/distributed-lock.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import { UserRole, RedemptionStatus } from '@prisma/client';

jest.mock('bcrypt');

// qrcode ships as ESM-only; mock it so the QR-image helper is testable under
// the CommonJS/Jest runtime without loading the real module.
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(async () => 'data:image/png;base64,MOCKQR'),
}));

const mockOfferRow = {
  id: 'offer-1',
  merchantId: 'merchant-1',
  title: '50% Off Pizza',
  category: 'DINING',
  description: 'Half price pizza',
  terms: 'Dine-in only',
  estimatedSavingsNpr: 500,
  isActive: true,
  merchant: {
    id: 'merchant-1',
    name: 'Pizza Palace',
    merchantPinHash: '$2b$10$hashedpin',
  },
};

describe('RedemptionService', () => {
  let service: RedemptionService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    offer: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    redemptionSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
    merchantStaff: {
      findUnique: jest.fn(),
    },
    merchantBranch: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLockService = {
    runWithLock: jest.fn(),
  };

  const mockMetricsService = {
    activeRedemptionSessions: { inc: jest.fn(), dec: jest.fn() },
    redemptionsTotal: { inc: jest.fn() },
    fraudFlagsTotal: { inc: jest.fn() },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedemptionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DistributedLockService, useValue: mockLockService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<RedemptionService>(RedemptionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Interactive-transaction form: invoke the callback with the tx client.
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );

    // Distributed lock passthrough: execute the guarded callback directly.
    mockLockService.runWithLock.mockImplementation(
      async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initRedemption', () => {
    const activeUser = {
      id: 'user-1',
      subscriptionActive: true,
      email: 'test@example.com',
      role: UserRole.USER,
    } as any;

    it('should initiate redemption successfully', async () => {
      const session = {
        id: 'session-1',
        code: 'ABCD1234',
        status: RedemptionStatus.INIT,
        codeExpiresAt: new Date(Date.now() + 300_000),
      };

      mockPrismaService.offer.findFirst.mockResolvedValue(mockOfferRow);
      mockPrismaService.redemptionSession.findFirst.mockResolvedValue(null);
      mockPrismaService.redemptionSession.create.mockResolvedValue(session);

      const result = await service.initRedemption('offer-1', activeUser, {} as any);

      // The service generates the redemption code itself, so assert on shape/format.
      expect(result.sessionId).toBe('session-1');
      expect(result.code).toMatch(/^[A-Z0-9-]+$/);
      expect(result).toHaveProperty('qrPayload');
      expect(result.merchantName).toBe('Pizza Palace');
      expect(result.offerTitle).toBe('50% Off Pizza');
      expect(result.expiresInSeconds).toBeGreaterThan(0);
      expect(mockMetricsService.activeRedemptionSessions.inc).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if subscription not active', async () => {
      const user = { ...activeUser, subscriptionActive: false };

      await expect(
        service.initRedemption('offer-1', user, {} as any),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if offer not found', async () => {
      mockPrismaService.offer.findFirst.mockResolvedValue(null);

      await expect(
        service.initRedemption('offer-1', activeUser, {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the existing unresolved session instead of creating a new one', async () => {
      const existingSession = {
        id: 'session-existing',
        code: 'EXISTING',
        status: RedemptionStatus.INIT,
        codeExpiresAt: new Date(Date.now() + 120_000),
      };

      mockPrismaService.offer.findFirst.mockResolvedValue(mockOfferRow);
      mockPrismaService.redemptionSession.findFirst.mockResolvedValue(
        existingSession,
      );

      const result = await service.initRedemption('offer-1', activeUser, {} as any);

      expect(result.sessionId).toBe('session-existing');
      expect(result.code).toBe('EXISTING');
      expect(mockPrismaService.redemptionSession.create).not.toHaveBeenCalled();
    });
  });

  describe('merchantRedeem', () => {
    const merchantUser = {
      id: 'user-1',
      merchantId: 'merchant-1',
      role: UserRole.MERCHANT_ADMIN,
      email: 'merchant@example.com',
    } as any;

    const buildSessionRow = (overrides: Record<string, any> = {}) => ({
      id: 'session-1',
      status: RedemptionStatus.INIT,
      codeExpiresAt: new Date(Date.now() + 100_000),
      savingsNpr: 500,
      offer: {
        id: 'offer-1',
        title: '50% Off Pizza',
        merchant: {
          id: 'merchant-1',
          name: 'Pizza Palace',
          merchantPinHash: '$2b$10$hashedpin',
        },
      },
      ...overrides,
    });

    it('should redeem successfully with valid PIN', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildSessionRow(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.redemptionSession.update.mockResolvedValue({
        id: 'session-1',
        savingsNpr: 500,
      });

      const result = await service.merchantRedeem(merchantUser, {
        code: 'ABCD1234',
        merchantPin: '1234',
      } as any);

      expect(result.success).toBe(true);
      expect(result.merchantName).toBe('Pizza Palace');
      expect(result.offerTitle).toBe('50% Off Pizza');
      expect(mockMetricsService.redemptionsTotal.inc).toHaveBeenCalledWith({
        merchant_id: 'merchant-1',
        status: 'SUCCESS',
      });
    });

    it('should throw NotFoundException for invalid code', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(null);

      await expect(
        service.merchantRedeem(merchantUser, {
          code: 'INVALID',
          merchantPin: '1234',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for already redeemed code', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildSessionRow({ status: RedemptionStatus.REDEEMED }),
      );

      await expect(
        service.merchantRedeem(merchantUser, {
          code: 'ABCD1234',
          merchantPin: '1234',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for an expired code', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildSessionRow({ codeExpiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(
        service.merchantRedeem(merchantUser, {
          code: 'ABCD1234',
          merchantPin: '1234',
        } as any),
      ).rejects.toThrow(
        'Redemption code has expired. Please ask customer to regenerate.',
      );
    });

    it('should throw UnauthorizedException for incorrect PIN', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildSessionRow(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.merchantRedeem(merchantUser, {
          code: 'ABCD1234',
          merchantPin: '9999',
        } as any),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockMetricsService.fraudFlagsTotal.inc).toHaveBeenCalledWith({
        reason: 'INVALID_MERCHANT_PIN',
        severity: 'MEDIUM',
      });
    });

    it('should throw UnauthorizedException when merchant has no PIN configured', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildSessionRow({
          offer: {
            id: 'offer-1',
            title: '50% Off Pizza',
            merchant: {
              id: 'merchant-1',
              name: 'Pizza Palace',
              merchantPinHash: null,
            },
          },
        }),
      );

      await expect(
        service.merchantRedeem(merchantUser, {
          code: 'ABCD1234',
          merchantPin: '1234',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
  describe('verifyQrRedemption', () => {
    const staffUser = {
      id: 'staff-user-1',
      merchantId: 'merchant-1',
      role: UserRole.MERCHANT_STAFF,
      email: 'cashier@example.com',
    } as any;

    const buildVerifySession = (overrides: Record<string, any> = {}) => ({
      id: 'session-qr-1',
      status: RedemptionStatus.INIT,
      codeExpiresAt: new Date(Date.now() + 100_000),
      savingsNpr: 500,
      offer: {
        id: 'offer-1',
        title: '50% Off Pizza',
        merchant: { id: 'merchant-1', name: 'Pizza Palace' },
      },
      ...overrides,
    });

    const mockActiveStaff = (overrides: Record<string, any> = {}) => ({
      id: 'staff-row-1',
      merchantId: 'merchant-1',
      isActive: true,
      role: UserRole.MERCHANT_STAFF,
      permissions: ['redeem'],
      ...overrides,
    });

    beforeEach(() => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildVerifySession(),
      );
      mockPrismaService.merchantStaff.findUnique.mockResolvedValue(
        mockActiveStaff(),
      );
      mockPrismaService.redemptionSession.update.mockResolvedValue({
        id: 'session-qr-1',
        savingsNpr: 500,
      });
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    });

    it('should redeem successfully from a scanned QR payload', async () => {
      const result = await service.verifyQrRedemption(staffUser, {
        qrPayload: 'offernepal://redeem?code=NF-ABCD12',
      } as any);

      expect(result.success).toBe(true);
      expect(result.offerTitle).toBe('50% Off Pizza');
      expect(result.merchantName).toBe('Pizza Palace');
      expect(mockPrismaService.redemptionSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RedemptionStatus.REDEEMED,
            staffId: 'staff-row-1',
          }),
        }),
      );
      // Staff audit written (Task 10)
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'RedemptionSession',
            action: 'redeem',
          }),
        }),
      );
    });

    it('should throw NotFoundException for an unknown code', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-000000',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for an expired code', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildVerifySession({ codeExpiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
        } as any),
      ).rejects.toThrow(
        'Redemption code has expired. Please ask customer to regenerate.',
      );
    });

    it('should throw ConflictException for an already-redeemed session', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        buildVerifySession({ status: RedemptionStatus.REDEEMED }),
      );

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException when staff lacks the redeem permission', async () => {
      mockPrismaService.merchantStaff.findUnique.mockResolvedValue(
        mockActiveStaff({ permissions: [] }),
      );

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
        } as any),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.redemptionSession.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when staff belongs to another merchant', async () => {
      mockPrismaService.merchantStaff.findUnique.mockResolvedValue(
        mockActiveStaff({ merchantId: 'merchant-2' }),
      );

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
        } as any),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.redemptionSession.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the caller is not active staff', async () => {
      mockPrismaService.merchantStaff.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject a branchId that belongs to a different merchant', async () => {
      mockPrismaService.merchantBranch.findUnique.mockResolvedValue({
        merchantId: 'merchant-2',
      });

      await expect(
        service.verifyQrRedemption(staffUser, {
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
          branchId: 'branch-x',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });


  describe('renderQrImage', () => {
    it('should return a PNG data URL for a valid payload', async () => {
      const result = await service.renderQrImage(
        'offernepal://redeem?code=NF-ABCD12',
      );

      expect(result.dataUrl).toBe('data:image/png;base64,MOCKQR');
    });

    it('should throw BadRequestException for an empty payload', async () => {
      await expect(service.renderQrImage('   ')).rejects.toThrow(
        BadRequestException,
      );
    });
  });


});
