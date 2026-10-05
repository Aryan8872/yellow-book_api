import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OfferService } from './offer.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';

describe('OfferService', () => {
  let service: OfferService;
  let prisma: PrismaService;

  const mockPrismaService = {
    offer: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
  };

  const mockMetricsService = {
    incrementCounter: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<OfferService>(OfferService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOffers', () => {
    it('should return paginated offers', async () => {
      const query = { page: 1, limit: 20 } as any;
      const mockOffers = [
        { id: 'offer-1', title: 'Offer 1', isActive: true },
        { id: 'offer-2', title: 'Offer 2', isActive: true },
      ];

      mockPrismaService.offer.findMany.mockResolvedValue(mockOffers);
      mockPrismaService.offer.count.mockResolvedValue(2);

      const result = await service.getOffers(query);

      expect(result).toHaveProperty('offers');
      expect(result.offers).toHaveLength(2);
      expect(result).toHaveProperty('total', 2);
    });

    it('should filter by category', async () => {
      const query = { category: 'DINING', page: 1, limit: 20 } as any;

      mockPrismaService.offer.findMany.mockResolvedValue([]);
      mockPrismaService.offer.count.mockResolvedValue(0);

      const result = await service.getOffers(query);

      expect(mockPrismaService.offer.findMany).toHaveBeenCalled();
    });

    it('should filter by search query', async () => {
      const query = { q: 'burger', page: 1, limit: 20 } as any;

      mockPrismaService.offer.findMany.mockResolvedValue([]);
      mockPrismaService.offer.count.mockResolvedValue(0);

      const result = await service.getOffers(query);

      expect(mockPrismaService.offer.findMany).toHaveBeenCalled();
    });

    it('should filter by location when coordinates provided', async () => {
      const query = { lat: 27.7172, lng: 85.324, radiusKm: 5, page: 1, limit: 20 } as any;
      const mockOffers = [
        {
          id: 'offer-1',
          merchant: {
            branches: [{ lat: 27.7172, lng: 85.324 }],
          },
        },
      ];

      mockPrismaService.offer.findMany.mockResolvedValue(mockOffers);
      mockPrismaService.offer.count.mockResolvedValue(1);

      const result = await service.getOffers(query);

      expect(result.offers).toHaveLength(1);
    });
  });

  describe('createOffer', () => {
    it('should create offer successfully', async () => {
      const merchantId = 'merchant-1';
      const dto = {
        title: '50% Off',
        description: 'Half price on all items',
        categoryId: 'cat-1',
        maxPerUser: 3,
        estimatedSavingsNpr: 500,
      } as any;

      mockPrismaService.merchant.findUnique.mockResolvedValue({
        id: merchantId,
        status: 'ACTIVE',
      });
      mockPrismaService.offer.create.mockResolvedValue({
        id: 'offer-1',
        ...dto,
        merchantId,
      });

      const result = await service.createOffer(merchantId, dto);

      expect(result).toHaveProperty('id');
      expect(mockPrismaService.offer.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if merchant not found', async () => {
      const merchantId = 'merchant-1';
      const dto = { title: '50% Off', categoryId: 'cat-1', maxPerUser: 3, estimatedSavingsNpr: 500 } as any;

      mockPrismaService.merchant.findUnique.mockResolvedValue(null);

      await expect(service.createOffer(merchantId, dto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if merchant not active', async () => {
      const merchantId = 'merchant-1';
      const dto = { title: '50% Off', categoryId: 'cat-1', maxPerUser: 3, estimatedSavingsNpr: 500 } as any;

      mockPrismaService.merchant.findUnique.mockResolvedValue({
        id: merchantId,
        status: 'INACTIVE',
      });

      await expect(service.createOffer(merchantId, dto))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user does not own merchant', async () => {
      const merchantId = 'merchant-1';
      const dto = { title: '50% Off', categoryId: 'cat-1', maxPerUser: 3, estimatedSavingsNpr: 500 } as any;

      mockPrismaService.merchant.findUnique.mockResolvedValue({
        id: merchantId,
        status: 'ACTIVE',
      });

      await expect(service.createOffer(merchantId, dto))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getOfferById', () => {
    it('should return offer by ID', async () => {
      const offerId = 'offer-1';
      const mockOffer = {
        id: offerId,
        title: '50% Off',
        isActive: true,
        merchant: { id: 'merchant-1', name: 'Test Merchant' },
        category: { id: 'cat-1', name: 'Dining' },
      };

      mockPrismaService.offer.findFirst.mockResolvedValue(mockOffer);

      const result = await service.getOfferById(offerId);

      expect(result).toHaveProperty('id', offerId);
      expect(result).toHaveProperty('title');
    });

    it('should throw NotFoundException if offer not found', async () => {
      const offerId = 'offer-1';

      mockPrismaService.offer.findFirst.mockResolvedValue(null);

      await expect(service.getOfferById(offerId))
        .rejects.toThrow(NotFoundException);
    });
  });
});
