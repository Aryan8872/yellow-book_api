import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OfferService } from './offer.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import { isOfferScheduleActive } from './offer.utils';

describe('OfferService', () => {
  let service: OfferService;
  let prisma: PrismaService;

  /**
   * Builds a Prisma-shaped offer payload matching OFFER_SELECT_FIELDS so that
   * mapOfferToSummary() can read merchant/category relations safely.
   */
  const buildOfferFixture = (overrides: Record<string, any> = {}) => ({
    id: 'offer-1',
    merchantId: 'merchant-1',
    categoryId: 'cat-1',
    title: 'Offer 1',
    description: 'A great offer',
    terms: 'Terms apply',
    estimatedSavingsNpr: 500,
    originalPriceNpr: null,
    discountPercentage: null,
    coverImage: null,
    images: [],
    highlights: [],
    rating: 4.8,
    reviewsCount: 0,
    isActive: true,
    isFeatured: false,
    validFrom: null,
    validUntil: null,
    availabilityJson: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    category: {
      id: 'cat-1',
      name: 'Dining',
      slug: 'dining',
      iconUrl: null,
      imageUrl: null,
      color: null,
    },
    merchant: {
      id: 'merchant-1',
      name: 'Test Merchant',
      description: null,
      logoUrl: null,
      coverUrl: null,
      websiteUrl: null,
      contactEmail: null,
      contactPhone: null,
      branches: [],
    },
    ...overrides,
  });

  const mockPrismaService = {
    offer: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockMetricsService = {
    offersCreated: { inc: jest.fn() },
    redemptionsTotal: { inc: jest.fn() },
    httpRequestsTotal: { inc: jest.fn() },
  };

  beforeAll(async () => {
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

  beforeEach(() => {
    jest.clearAllMocks();

    // Prisma's array-form $transaction resolves each element of the input array.
    mockPrismaService.$transaction.mockImplementation(
      (ops: Promise<unknown>[]) => Promise.all(ops),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOffers', () => {
    it('should return paginated offers', async () => {
      const query = { page: 1, limit: 20 } as any;
      const mockOffers = [
        buildOfferFixture({ id: 'offer-1', title: 'Offer 1' }),
        buildOfferFixture({ id: 'offer-2', title: 'Offer 2' }),
      ];

      mockPrismaService.offer.findMany.mockResolvedValue(mockOffers);
      mockPrismaService.offer.count.mockResolvedValue(2);

      const result = await service.getOffers(query);

      expect(result).toHaveProperty('offers');
      expect(result.offers).toHaveLength(2);
      expect(result).toHaveProperty('total', 2);
      expect(result).toHaveProperty('count', 2);
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
        buildOfferFixture({
          merchant: {
            id: 'merchant-1',
            name: 'Test Merchant',
            description: null,
            logoUrl: null,
            coverUrl: null,
            websiteUrl: null,
            contactEmail: null,
            contactPhone: null,
            branches: [{ id: 'b1', name: 'Main', address: 'Kathmandu', district: 'KATHMANDU', lat: 27.7172, lng: 85.324 }],
          },
        }),
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

      const createdOffer = buildOfferFixture({ id: 'offer-1', ...dto, merchantId });

      mockPrismaService.merchant.findUnique.mockResolvedValue({
        id: merchantId,
        status: 'ACTIVE',
      });
      mockPrismaService.offer.create.mockResolvedValue(createdOffer);
      mockPrismaService.offer.findUnique.mockResolvedValue(createdOffer);

      const result = await service.createOffer(merchantId, dto);

      expect(result).toHaveProperty('id');
      expect(mockPrismaService.offer.create).toHaveBeenCalled();
      expect(mockPrismaService.offer.findUnique).toHaveBeenCalled();
      expect(mockMetricsService.offersCreated.inc).toHaveBeenCalledWith({
        merchant_id: merchantId,
      });
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
  });

  describe('getOfferById', () => {
    it('should return offer by ID', async () => {
      const offerId = 'offer-1';
      mockPrismaService.offer.findFirst.mockResolvedValue(
        buildOfferFixture({
          id: offerId,
          title: '50% Off',
        }),
      );

      const result = await service.getOfferById(offerId);

      expect(result).toHaveProperty('id', offerId);
      expect(result).toHaveProperty('title', '50% Off');
      expect(result.merchantName).toBe('Test Merchant');
    });

    it('should throw NotFoundException if offer not found', async () => {
      const offerId = 'offer-1';

      mockPrismaService.offer.findFirst.mockResolvedValue(null);

      await expect(service.getOfferById(offerId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('isOfferScheduleActive', () => {
    const now = new Date('2026-06-01T00:00:00Z');

    it('treats null bounds as always active', () => {
      expect(
        isOfferScheduleActive({ validFrom: null, validUntil: null }, now),
      ).toBe(true);
    });

    it('is active within the window', () => {
      expect(
        isOfferScheduleActive(
          {
            validFrom: new Date('2026-01-01T00:00:00Z'),
            validUntil: new Date('2026-12-31T00:00:00Z'),
          },
          now,
        ),
      ).toBe(true);
    });

    it('is inactive before validFrom', () => {
      expect(
        isOfferScheduleActive({ validFrom: new Date('2026-07-01T00:00:00Z') }, now),
      ).toBe(false);
    });

    it('is inactive after validUntil', () => {
      expect(
        isOfferScheduleActive({ validUntil: new Date('2026-05-01T00:00:00Z') }, now),
      ).toBe(false);
    });

    it('is active at the exact boundary (inclusive)', () => {
      expect(isOfferScheduleActive({ validFrom: now }, now)).toBe(true);
      expect(isOfferScheduleActive({ validUntil: now }, now)).toBe(true);
    });
  });

  describe('getOffers schedule enforcement', () => {
    it('excludes not-yet-started and expired offers from browse results', async () => {
      const mockOffers = [
        buildOfferFixture({ id: 'o-unbounded', title: 'Unbounded' }),
        buildOfferFixture({
          id: 'o-active',
          title: 'Active',
          validFrom: new Date('2020-01-01T00:00:00Z'),
          validUntil: new Date('2099-01-01T00:00:00Z'),
        }),
        buildOfferFixture({
          id: 'o-expired',
          title: 'Expired',
          validUntil: new Date('2000-01-01T00:00:00Z'),
        }),
        buildOfferFixture({
          id: 'o-future',
          title: 'Not Started',
          validFrom: new Date('2099-01-01T00:00:00Z'),
        }),
      ];

      mockPrismaService.offer.findMany.mockResolvedValue(mockOffers);
      mockPrismaService.offer.count.mockResolvedValue(mockOffers.length);

      const result = await service.getOffers({ page: 1, limit: 20 } as any);

      expect(result.offers.map((o) => o.title).sort()).toEqual([
        'Active',
        'Unbounded',
      ]);
    });
  });

});
