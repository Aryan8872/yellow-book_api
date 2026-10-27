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
import { UserRole as AuthUserRole } from '../auth/auth.types';

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
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    subscriptionRecord: {
      findFirst: jest.fn(),
    },
    systemTrialConfig: {
      findFirst: jest.fn(),
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
    mockPrismaService.redemptionSession.updateMany.mockResolvedValue({
      count: 1,
    });

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

      // Free-tier path: no active subscription record, no user trial config,
      // and the monthly REDEEMED count already at the 3-voucher cap.
      mockPrismaService.subscriptionRecord.findFirst.mockResolvedValue(null);
      mockPrismaService.systemTrialConfig.findFirst.mockResolvedValue(null);
      mockPrismaService.redemptionSession.count.mockResolvedValue(3);

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

  describe('listRedemptions', () => {
    it('passes skip/take to Prisma as NUMBERS (regression guard for the string-take 500)', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({ page: 2, limit: 20 } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.skip).toBe(20);
      expect(args.take).toBe(20);
      expect(typeof args.skip).toBe('number');
      expect(typeof args.take).toBe('number');
    });

    it('defaults to an unfiltered where and createdAt desc ordering', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({ page: 1, limit: 20 } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('applies sortBy/sortOrder when provided', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        sortBy: 'redeemedAt',
        sortOrder: 'desc',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ redeemedAt: 'desc' });
    });

    it('falls back to asc when sortBy is set without a sort order', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'asc' });
    });

    it('maps merchantId to a nested offer filter', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        merchantId: 'merchant-9',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.where.offer).toEqual({ merchantId: 'merchant-9' });
    });

    it('passes offerId and status through as top-level filters', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        offerId: 'offer-3',
        status: 'REDEEMED',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.where.offerId).toBe('offer-3');
      expect(args.where.status).toBe('REDEEMED');
    });

    it('converts start/end dates to Date objects on createdAt', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T00:00:00.000Z',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.where.createdAt.gte).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(args.where.createdAt.lte).toEqual(
        new Date('2026-01-31T00:00:00.000Z'),
      );
    });

    it('sets only gte when just a start date is given', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        startDate: '2026-01-01T00:00:00.000Z',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.where.createdAt.gte).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(args.where.createdAt.lte).toBeUndefined();
    });

    it('builds a case-insensitive OR search over user email and offer title', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        search: 'pizza',
      } as any);

      const args = mockPrismaService.redemptionSession.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { user: { email: { contains: 'pizza', mode: 'insensitive' } } },
        { offer: { title: { contains: 'pizza', mode: 'insensitive' } } },
      ]);
    });

    it('uses the same where clause for both findMany and count', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(0);

      await service.listRedemptions({
        page: 1,
        limit: 20,
        offerId: 'offer-3',
        search: 'pizza',
      } as any);

      const findManyWhere =
        mockPrismaService.redemptionSession.findMany.mock.calls[0][0].where;
      const countWhere =
        mockPrismaService.redemptionSession.count.mock.calls[0][0].where;
      expect(countWhere).toEqual(findManyWhere);
    });

    it('returns pagination with totalPages/hasNext/hasPrevious', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(45);

      const result = await service.listRedemptions({ page: 2, limit: 20 } as any);

      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: Math.ceil(45 / 20),
        hasNext: true,
        hasPrevious: true,
      });
    });

    it('reports no next page on the last page', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(45);

      const result = await service.listRedemptions({ page: 3, limit: 20 } as any);

      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrevious).toBe(true);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('reports no previous page on the first page', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.redemptionSession.count.mockResolvedValue(5);

      const result = await service.listRedemptions({ page: 1, limit: 20 } as any);

      expect(result.pagination.hasPrevious).toBe(false);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('returns the sessions as data unchanged', async () => {
      const rows = [{ id: 'session-1' }, { id: 'session-2' }];
      mockPrismaService.redemptionSession.findMany.mockResolvedValue(rows);
      mockPrismaService.redemptionSession.count.mockResolvedValue(2);

      const result = await service.listRedemptions({ page: 1, limit: 20 } as any);

      expect(result.data).toEqual(rows);
    });
  });

  describe('getMyRedemptions', () => {
    const branchRow = {
      id: 'branch-1',
      name: 'Pizza Palace Kathmandu',
      address: 'Thamel, Kathmandu',
      district: 'Kathmandu',
      lat: '27.7103',
      lng: '85.3222',
    };

    const merchantRow = {
      id: 'merchant-1',
      name: 'Pizza Palace',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverUrl: 'https://cdn.example.com/cover.png',
      contactPhone: '+977-1-1234567',
      websiteUrl: 'https://pizzapalace.example.com',
      branches: [branchRow],
    };

    const sessionRow = {
      id: 'session-1',
      offerId: 'offer-1',
      status: 'REDEEMED',
      code: 'NF-ABCD12',
      savingsNpr: 500,
      redeemedAt: new Date('2026-01-05T10:00:00.000Z'),
      createdAt: new Date('2026-01-05T09:00:00.000Z'),
      codeExpiresAt: new Date('2026-01-06T09:00:00.000Z'),
      branch: null,
      offer: {
        id: 'offer-1',
        title: '50% Off Pizza',
        description: 'Half off all pizza',
        terms: 'Valid at dine-in only',
        estimatedSavingsNpr: 500,
        originalPriceNpr: 1000,
        discountPercentage: 50,
        coverImage: 'https://cdn.example.com/offer-cover.jpg',
        images: ['https://cdn.example.com/offer-1.jpg'],
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Food', slug: 'food', iconUrl: 'https://cdn.example.com/food.png' },
        merchant: merchantRow,
      },
    };

    it('queries by userId ordered by newest first', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);

      await service.getMyRedemptions('user-7');

      expect(mockPrismaService.redemptionSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-7' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('maps rows to the customer-facing shape', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([sessionRow]);

      const result = await service.getMyRedemptions('user-7');

      expect(result).toEqual([
        {
          id: 'session-1',
          offerId: 'offer-1',
          offerTitle: '50% Off Pizza',
          merchantName: 'Pizza Palace',
          status: 'REDEEMED',
          redemptionCode: 'NF-ABCD12',
          qrPayload: 'offernepal://redeem?code=NF-ABCD12',
          savingsNpr: 500,
          redeemedAt: '2026-01-05T10:00:00.000Z',
          expiresAt: '2026-01-06T09:00:00.000Z',
          offer: {
            id: 'offer-1',
            title: '50% Off Pizza',
            description: 'Half off all pizza',
            terms: 'Valid at dine-in only',
            estimatedSavingsNpr: 500,
            originalPriceNpr: 1000,
            discountPercentage: 50,
            coverImage: 'https://cdn.example.com/offer-cover.jpg',
            images: ['https://cdn.example.com/offer-1.jpg'],
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'Food', slug: 'food', iconUrl: 'https://cdn.example.com/food.png' },
          },
          merchant: {
            id: 'merchant-1',
            name: 'Pizza Palace',
            logoUrl: 'https://cdn.example.com/logo.png',
            coverUrl: 'https://cdn.example.com/cover.png',
            contactPhone: '+977-1-1234567',
            websiteUrl: 'https://pizzapalace.example.com',
            branches: [
              {
                id: 'branch-1',
                name: 'Pizza Palace Kathmandu',
                address: 'Thamel, Kathmandu',
                district: 'Kathmandu',
                lat: 27.7103,
                lng: 85.3222,
              },
            ],
          },
          branch: {
            id: 'branch-1',
            name: 'Pizza Palace Kathmandu',
            address: 'Thamel, Kathmandu',
            district: 'Kathmandu',
            lat: 27.7103,
            lng: 85.3222,
          },
        },
      ]);
    });

    it('falls back to createdAt when the session is not yet redeemed', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([
        { ...sessionRow, redeemedAt: null },
      ]);

      const result = await service.getMyRedemptions('user-7');

      expect(result[0].redeemedAt).toBe('2026-01-05T09:00:00.000Z');
    });

    it('serializes dates to ISO strings', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([sessionRow]);

      const result = await service.getMyRedemptions('user-7');

      expect(typeof result[0].redeemedAt).toBe('string');
      expect(typeof result[0].expiresAt).toBe('string');
    });

    it('returns an empty array when the user has no redemptions', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);

      const result = await service.getMyRedemptions('user-7');

      expect(result).toEqual([]);
    });

    // ── T-30-01 scoping: offerId filters, but is ALWAYS anded with userId ──
    it('scopes findMany by offerId AND the JWT userId when offerId is provided', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);

      await service.getMyRedemptions('user-7', 'offer-1');

      expect(mockPrismaService.redemptionSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-7', offerId: 'offer-1' },
        }),
      );
    });

    it('scopes findMany by userId only when offerId is omitted', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);

      await service.getMyRedemptions('user-7');

      expect(mockPrismaService.redemptionSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-7' },
        }),
      );
    });

    it('enriches a two-branch merchant, mapping lat/lng to numbers and falling back to the first branch', async () => {
      const secondBranch = {
        id: 'branch-2',
        name: 'Pizza Palace Pokhara',
        address: 'Lakeside, Pokhara',
        district: 'Kaski',
        lat: '28.2096',
        lng: '83.9856',
      };
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([
        {
          ...sessionRow,
          branch: null,
          offer: {
            ...sessionRow.offer,
            merchant: { ...merchantRow, branches: [branchRow, secondBranch] },
          },
        },
      ]);

      const result = await service.getMyRedemptions('user-7');

      expect(result[0].merchant.branches).toEqual([
        { id: 'branch-1', name: 'Pizza Palace Kathmandu', address: 'Thamel, Kathmandu', district: 'Kathmandu', lat: 27.7103, lng: 85.3222 },
        { id: 'branch-2', name: 'Pizza Palace Pokhara', address: 'Lakeside, Pokhara', district: 'Kaski', lat: 28.2096, lng: 83.9856 },
      ]);
      // Pitfall 5: session has no branch → fall back to merchant's first branch
      expect(result[0].branch).toEqual(result[0].merchant.branches[0]);
    });

    it('returns branch null when neither the session nor the merchant has any branch', async () => {
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([
        {
          ...sessionRow,
          branch: null,
          offer: { ...sessionRow.offer, merchant: { ...merchantRow, branches: [] } },
        },
      ]);

      const result = await service.getMyRedemptions('user-7');

      expect(result[0].branch).toBeNull();
    });

    it('derives expiresAt from the session codeExpiresAt', async () => {
      const initRow = {
        ...sessionRow,
        status: 'INIT',
        redeemedAt: null,
        createdAt: new Date('2026-02-01T08:00:00.000Z'),
        codeExpiresAt: new Date('2026-02-02T08:30:00.000Z'),
      };
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([initRow]);

      const result = await service.getMyRedemptions('user-7');

      expect(result[0].expiresAt).toBe('2026-02-02T08:30:00.000Z');
      expect(result[0].redeemedAt).toBe('2026-02-01T08:00:00.000Z');
    });
  });

  describe('cancelRedemption consumer policy', () => {
    const consumer = {
      id: 'user-1',
      email: 'consumer@example.com',
      role: AuthUserRole.CONSUMER,
    } as any;

    const sessionFor = (status: RedemptionStatus, userId = 'user-1') => ({
      id: 'session-1',
      userId,
      status,
      offer: { merchantId: 'merchant-1' },
    });

    it.each([RedemptionStatus.INIT, RedemptionStatus.PENDING_SYNC])(
      'allows the owner to cancel %s',
      async (status) => {
        mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
          sessionFor(status),
        );

        await expect(
          service.cancelRedemption('session-1', consumer),
        ).resolves.toEqual({ success: true, sessionId: 'session-1' });

        const mutation =
          mockPrismaService.redemptionSession.update.mock.calls[0]?.[0] ??
          mockPrismaService.redemptionSession.updateMany.mock.calls[0]?.[0];
        expect(mutation).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'session-1',
              status,
              userId: 'user-1',
            }),
            data: { status: RedemptionStatus.REJECTED },
          }),
        );
      },
    );

    it('rejects another user without mutating the redemption', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        sessionFor(RedemptionStatus.INIT, 'user-2'),
      );

      await expect(
        service.cancelRedemption('session-1', consumer),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrismaService.redemptionSession.update).not.toHaveBeenCalled();
      expect(
        mockPrismaService.redemptionSession.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('rejects a concurrent status change without reporting cancellation', async () => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        sessionFor(RedemptionStatus.INIT),
      );
      mockPrismaService.redemptionSession.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.cancelRedemption('session-1', consumer),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([
      RedemptionStatus.REDEEMED,
      RedemptionStatus.REJECTED,
      RedemptionStatus.EXPIRED,
    ])('rejects terminal status %s without mutation', async (status) => {
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(
        sessionFor(status),
      );

      await expect(
        service.cancelRedemption('session-1', consumer),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrismaService.redemptionSession.update).not.toHaveBeenCalled();
      expect(
        mockPrismaService.redemptionSession.updateMany,
      ).not.toHaveBeenCalled();
    });
  });
});
