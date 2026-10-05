import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { RedemptionService } from './redemption.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UserRole, RedemptionStatus } from '@prisma/client';

describe('RedemptionService', () => {
  let service: RedemptionService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    offer: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    redemptionSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedemptionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RedemptionService>(RedemptionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initRedemption', () => {
    it('should initiate redemption successfully', async () => {
      const user = { id: 'user-1', subscriptionActive: true, email: 'test@example.com', role: UserRole.USER } as any;
      const offerId = 'offer-1';
      const dto = { userLat: 27.7172, userLng: 85.324 } as any;
      
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        subscriptionActive: true,
      });
      mockPrismaService.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        isActive: true,
        maxPerUser: 3,
      });
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.redemptionSession.create.mockResolvedValue({
        id: 'session-1',
        code: 'ABCD1234',
        status: RedemptionStatus.INIT,
      });

      const result = await service.initRedemption(offerId, user, dto);

      expect(result).toHaveProperty('code');
      expect(mockPrismaService.redemptionSession.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if subscription not active', async () => {
      const user = { id: 'user-1', subscriptionActive: false, email: 'test@example.com', role: UserRole.USER } as any;
      const offerId = 'offer-1';
      const dto = {} as any;
      
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        subscriptionActive: false,
      });

      await expect(service.initRedemption(offerId, user, dto))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if offer not found', async () => {
      const user = { id: 'user-1', subscriptionActive: true, email: 'test@example.com', role: UserRole.USER } as any;
      const offerId = 'offer-1';
      const dto = {} as any;
      
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        subscriptionActive: true,
      });
      mockPrismaService.offer.findUnique.mockResolvedValue(null);

      await expect(service.initRedemption(offerId, user, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if redemption limit exceeded', async () => {
      const user = { id: 'user-1', subscriptionActive: true, email: 'test@example.com', role: UserRole.USER } as any;
      const offerId = 'offer-1';
      const dto = {} as any;
      
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        subscriptionActive: true,
      });
      mockPrismaService.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        isActive: true,
        maxPerUser: 3,
      });
      mockPrismaService.redemptionSession.findMany.mockResolvedValue([
        { status: RedemptionStatus.REDEEMED },
        { status: RedemptionStatus.REDEEMED },
        { status: RedemptionStatus.REDEEMED },
      ]);

      await expect(service.initRedemption(offerId, user, dto))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('merchantRedeem', () => {
    it('should redeem successfully with valid PIN', async () => {
      const user = { id: 'user-1', merchantId: 'merchant-1', role: UserRole.MERCHANT_ADMIN, email: 'test@example.com' } as any;
      const dto = { code: 'ABCD1234', merchantPin: '1234' } as any;
      
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue({
        id: 'session-1',
        status: RedemptionStatus.INIT,
        codeExpiresAt: new Date(Date.now() + 100000),
      });
      mockPrismaService.merchant.findUnique.mockResolvedValue({
        merchantPinHash: '$2b$10$hash',
        staff: [{ user: { passwordHash: '$2b$10$hash' } }],
      });
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.redemptionSession.update.mockResolvedValue({
        status: RedemptionStatus.REDEEMED,
      });

      const result = await service.merchantRedeem(user, dto);

      expect(result).toHaveProperty('status', RedemptionStatus.REDEEMED);
    });

    it('should throw NotFoundException for invalid code', async () => {
      const user = { id: 'user-1', merchantId: 'merchant-1', role: UserRole.MERCHANT_ADMIN, email: 'test@example.com' } as any;
      const dto = { code: 'INVALID', merchantPin: '1234' } as any;
      
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue(null);

      await expect(service.merchantRedeem(user, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for already redeemed code', async () => {
      const user = { id: 'user-1', merchantId: 'merchant-1', role: UserRole.MERCHANT_ADMIN, email: 'test@example.com' } as any;
      const dto = { code: 'ABCD1234', merchantPin: '1234' } as any;
      
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue({
        id: 'session-1',
        status: RedemptionStatus.REDEEMED,
      });

      await expect(service.merchantRedeem(user, dto))
        .rejects.toThrow(ConflictException);
    });

    it('should throw UnauthorizedException for incorrect PIN', async () => {
      const user = { id: 'user-1', merchantId: 'merchant-1', role: UserRole.MERCHANT_ADMIN, email: 'test@example.com' } as any;
      const dto = { code: 'ABCD1234', merchantPin: '9999' } as any;
      
      mockPrismaService.redemptionSession.findUnique.mockResolvedValue({
        id: 'session-1',
        status: RedemptionStatus.INIT,
        codeExpiresAt: new Date(Date.now() + 100000),
      });
      mockPrismaService.merchant.findUnique.mockResolvedValue({
        merchantPinHash: '$2b$10$hash',
      });

      await expect(service.merchantRedeem(user, dto))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
