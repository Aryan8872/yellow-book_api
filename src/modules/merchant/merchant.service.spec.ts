import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MerchantBranchService } from './services/merchant-branch.service';
import { MerchantStaffService } from './services/merchant-staff.service';
import { MerchantAnalyticsService } from './services/merchant-analytics.service';

describe('MerchantService', () => {
  let service: MerchantService;

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
    offer: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const adminUser = { id: 'a1', role: 'ADMIN' } as any;
  const staffUser = {
    id: 'staff-1',
    role: 'MERCHANT_STAFF',
    merchantId: 'mer-1',
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MerchantBranchService, useValue: {} },
        { provide: MerchantStaffService, useValue: {} },
        { provide: MerchantAnalyticsService, useValue: {} },
      ],
    }).compile();

    service = module.get(MerchantService);
  });

  describe('verifyMerchantAccess (via getMerchantOffers)', () => {
    it('lets ADMIN bypass the ownership lookup entirely', async () => {
      mockPrisma.offer.findMany.mockResolvedValue([]);
      mockPrisma.offer.count.mockResolvedValue(0);

      await service.getMerchantOffers('any-mer', {} as any, adminUser);

      expect(mockPrisma.merchant.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFound when the merchant does not exist', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.getMerchantOffers('ghost', {} as any, staffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a user with no staff row on the merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'mer-1',
        staff: [{ userId: 'someone-else' }],
      });

      await expect(
        service.getMerchantOffers('mer-1', {} as any, staffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admits a staff member with a matching staff row', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'mer-1',
        staff: [{ userId: 'staff-1' }],
      });
      mockPrisma.offer.findMany.mockResolvedValue([]);
      mockPrisma.offer.count.mockResolvedValue(0);

      const result = await service.getMerchantOffers(
        'mer-1',
        {} as any,
        staffUser,
      );

      expect(result.pagination).toBeDefined();
    });
  });

  describe('getMerchantOffers pagination and filters', () => {
    beforeEach(() => {
      // Access stub so filter tests focus on the query, not the guard.
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'mer-1',
        staff: [{ userId: 'staff-1' }],
      });
      mockPrisma.offer.findMany.mockResolvedValue([{ id: 'o1' }]);
      mockPrisma.offer.count.mockResolvedValue(21);
    });

    it('passes skip/take as NUMBERS (regression guard for the take:"20" 500)', async () => {
      await service.getMerchantOffers(
        'mer-1',
        { page: 2, limit: 20 } as any,
        staffUser,
      );

      const query = mockPrisma.offer.findMany.mock.calls[0][0];
      expect(query.skip).toBe(20);
      expect(query.take).toBe(20);
      expect(typeof query.skip).toBe('number');
      expect(typeof query.take).toBe('number');
    });

    it('builds an OR filter for category id-or-slug', async () => {
      await service.getMerchantOffers(
        'mer-1',
        { category: 'dining' } as any,
        staffUser,
      );

      const query = mockPrisma.offer.findMany.mock.calls[0][0];
      expect(query.where.OR).toEqual([
        { categoryId: 'dining' },
        {
          category: {
            slug: { equals: 'dining', mode: 'insensitive' },
          },
        },
      ]);
    });

    it('maps search to an insensitive title containment filter', async () => {
      await service.getMerchantOffers(
        'mer-1',
        { search: 'pizza' } as any,
        staffUser,
      );

      const query = mockPrisma.offer.findMany.mock.calls[0][0];
      expect(query.where.title).toEqual({
        contains: 'pizza',
        mode: 'insensitive',
      });
    });

    it('passes isActive/isFeatured through and honors sortBy/sortOrder', async () => {
      await service.getMerchantOffers(
        'mer-1',
        {
          isActive: true,
          isFeatured: false,
          sortBy: 'title',
          sortOrder: 'asc',
        } as any,
        staffUser,
      );

      const query = mockPrisma.offer.findMany.mock.calls[0][0];
      expect(query.where.isActive).toBe(true);
      expect(query.where.isFeatured).toBe(false);
      expect(query.orderBy).toEqual({ title: 'asc' });
    });

    it('computes pagination metadata with totalPages = ceil(total/limit)', async () => {
      const result = await service.getMerchantOffers(
        'mer-1',
        { page: 2, limit: 20 } as any,
        staffUser,
      );

      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 21,
        totalPages: 2,
      });
      expect(result.data).toEqual([{ id: 'o1' }]);
    });
  });
});
