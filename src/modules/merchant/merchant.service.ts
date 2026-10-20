import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { AuthenticatedUser } from '../auth/auth.types';
import { ListMerchantsDto } from '../admin/dto/list-merchants.dto';
import { ListBranchesDto } from '../admin/dto/list-branches.dto';
import { ListMerchantRedemptionsDto } from './dto/list-merchant-redemptions.dto';
import { ListMerchantOffersDto } from './dto/list-merchant-offers.dto';
import { TimeRangeDto } from '../analytics/dto/time-range.dto';

// Sub-services
import { MerchantBranchService } from './services/merchant-branch.service';
import { MerchantStaffService } from './services/merchant-staff.service';
import { MerchantAnalyticsService } from './services/merchant-analytics.service';

@Injectable()
export class MerchantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchService: MerchantBranchService,
    private readonly staffService: MerchantStaffService,
    private readonly analyticsService: MerchantAnalyticsService,
  ) {}

  // =========================================================================
  // Access Control & Helpers
  // =========================================================================

  private async verifyMerchantAccess(merchantId: string, user: AuthenticatedUser) {
    if (user.role === UserRole.ADMIN) return;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { staff: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const hasAccess = merchant.staff.some((s) => s.userId === user.id);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this merchant');
    }
  }

  // =========================================================================
  // Merchant Profile CRUD
  // =========================================================================

  async createMerchant(dto: CreateMerchantDto, user: AuthenticatedUser) {
    return this.prisma.merchant.create({
      data: {
        ...dto,
        status: 'PENDING_REVIEW',
      },
    });
  }

  async listAllMerchants(dto: ListMerchantsDto) {
    const { page, limit, search, status, sortBy, sortOrder } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { contactPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.MerchantOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy] = sortOrder || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return {
      data: merchants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      },
    };
  }

  async getMerchant(id: string, user: AuthenticatedUser) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        branches: true,
        staff: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return merchant;
  }

  async updateMerchant(id: string, dto: UpdateMerchantDto, user: AuthenticatedUser) {
    await this.getMerchant(id, user);

    const { logoImage, coverImage, ...rest } = dto as any;
    const finalData = {
      ...rest,
      ...(logoImage !== undefined && { logoUrl: logoImage }),
      ...(coverImage !== undefined && { coverUrl: coverImage }),
    };

    return this.prisma.merchant.update({
      where: { id },
      data: finalData,
    });
  }

  // =========================================================================
  // Delegated Branch Operations
  // =========================================================================

  async createBranch(merchantId: string, dto: CreateBranchDto, user: AuthenticatedUser) {
    return this.branchService.createBranch(merchantId, dto, user);
  }

  async getBranches(
    merchantId: string,
    dtoOrUser?: { page?: number; limit?: number; search?: string; isActive?: boolean } | AuthenticatedUser,
    user?: AuthenticatedUser,
  ) {
    if (dtoOrUser && 'id' in dtoOrUser && 'role' in dtoOrUser) {
      return this.branchService.getBranches(merchantId, undefined, dtoOrUser as AuthenticatedUser);
    }
    return this.branchService.getBranches(merchantId, dtoOrUser as any, user);
  }

  async listAllBranches(dto: ListBranchesDto) {
    return this.branchService.listAllBranches(dto);
  }

  async updateBranch(branchId: string, merchantId: string, dto: UpdateBranchDto, user: AuthenticatedUser) {
    return this.branchService.updateBranch(branchId, merchantId, dto, user);
  }

  async deleteBranch(branchId: string, merchantId: string, user: AuthenticatedUser) {
    return this.branchService.deleteBranch(branchId, merchantId, user);
  }

  // =========================================================================
  // Delegated Staff Operations
  // =========================================================================

  async createStaff(merchantId: string, dto: CreateStaffDto, user: AuthenticatedUser) {
    return this.staffService.createStaff(merchantId, dto, user);
  }

  async getStaff(
    merchantId: string,
    dtoOrUser?: { page?: number; limit?: number; search?: string; isActive?: boolean } | AuthenticatedUser,
    user?: AuthenticatedUser,
  ) {
    if (dtoOrUser && 'id' in dtoOrUser && 'role' in dtoOrUser) {
      return this.staffService.getStaff(merchantId, undefined, dtoOrUser as AuthenticatedUser);
    }
    return this.staffService.getStaff(merchantId, dtoOrUser as any, user);
  }

  async updateStaff(staffId: string, merchantId: string, dto: UpdateStaffDto, user: AuthenticatedUser) {
    return this.staffService.updateStaff(staffId, merchantId, dto, user);
  }

  async updateMerchantPin(merchantId: string, dto: UpdatePinDto, user: AuthenticatedUser) {
    return this.staffService.updateMerchantPin(merchantId, dto, user);
  }

  // =========================================================================
  // Dashboard & Operational Lists
  // =========================================================================

  async getMerchantDashboard(merchantId: string, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        _count: {
          select: {
            branches: true,
            staff: true,
            offers: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const activeOffers = await this.prisma.offer.count({
      where: {
        merchantId,
        isActive: true,
      },
    });

    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
      },
    });

    return {
      totalOffers: merchant._count.offers,
      activeOffers,
      totalRedemptions,
      totalBranches: merchant._count.branches,
      totalStaff: merchant._count.staff,
    };
  }

  async getMerchantRedemptions(merchantId: string, dto: ListMerchantRedemptionsDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);

    const {
      page = 1,
      limit = 20,
      search,
      status,
      startDate,
      endDate,
      offerId,
      branchId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = dto;

    const where: Prisma.RedemptionSessionWhereInput = {
      offer: { merchantId },
    };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { offer: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (offerId) {
      where.offerId = offerId;
    }

    if (branchId) {
      where.branchId = branchId;
    }

    const [redemptions, total] = await Promise.all([
      this.prisma.redemptionSession.findMany({
        where,
        include: {
          offer: {
            select: {
              id: true,
              title: true,
              category: true,
              originalPriceNpr: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.redemptionSession.count({ where }),
    ]);

    return {
      data: redemptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantOffers(merchantId: string, dto: ListMerchantOffersDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);

    const { page = 1, limit = 20, search, category, isActive, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = dto;

    const where: Prisma.OfferWhereInput = { merchantId };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (category) {
      where.OR = [
        { categoryId: category },
        { category: { slug: { equals: category.toLowerCase(), mode: 'insensitive' } } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }

    const [offers, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      data: offers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // Delegated Analytics Operations
  // =========================================================================

  async getMerchantAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantAnalytics(merchantId, dto, user);
  }

  async getMerchantRevenueAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantRevenueAnalytics(merchantId, dto, user);
  }

  async getMerchantCustomerAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantCustomerAnalytics(merchantId, dto, user);
  }

  async getMerchantOfferPerformanceAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantOfferPerformanceAnalytics(merchantId, dto, user);
  }

  async getMerchantBranchPerformanceAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantBranchPerformanceAnalytics(merchantId, dto, user);
  }

  async getMerchantTimeBasedAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantTimeBasedAnalytics(merchantId, dto, user);
  }

  async getMerchantGrowthMetrics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantGrowthMetrics(merchantId, dto, user);
  }

  async getMerchantCategoryAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    return this.analyticsService.getMerchantCategoryAnalytics(merchantId, dto, user);
  }

  // =========================================================================
  // Merchant Self-Serve Billing & Quotas
  // =========================================================================

  async getMerchantBilling(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    // 1. Fetch current subscription
    let subscription = await this.prisma.subscriptionRecord.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    const now = new Date();

    // If no subscription, check if default founding partner or trial is active
    if (!subscription) {
      const foundingPlan = await this.prisma.subscriptionPlan.findFirst({
        where: { code: 'MERCHANT_FOUNDING' },
      });
      if (foundingPlan) {
        subscription = {
          id: 'trial_sub',
          planId: foundingPlan.id,
          merchantId,
          userId: null,
          status: 'ACTIVE' as any,
          isTrial: true,
          startedAt: merchant.createdAt,
          currentPeriodStart: merchant.createdAt,
          currentPeriodEnd: new Date(merchant.createdAt.getTime() + 180 * 24 * 60 * 60 * 1000),
          gracePeriodEndsAt: null,
          cancelledAt: null,
          autoRenew: true,
          isManualOverride: false,
          overrideReason: null,
          overrideAdminId: null,
          createdAt: merchant.createdAt,
          updatedAt: merchant.createdAt,
          plan: foundingPlan,
        };
      }
    }

    // 2. Compute remaining days
    const periodEnd = subscription?.currentPeriodEnd || now;
    const diffMs = periodEnd.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // 3. Quota usage
    const [branchCount, activeOfferCount] = await Promise.all([
      this.prisma.merchantBranch.count({ where: { merchantId } }),
      this.prisma.offer.count({ where: { merchantId, isActive: true } }),
    ]);

    const entitlements = (subscription?.plan?.entitlementsJson as any) || {};

    return {
      merchantId,
      merchantName: merchant.name,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            isTrial: subscription.isTrial,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            remainingDays,
            isExpiringSoon: remainingDays <= 14,
            isExpired: remainingDays === 0,
            plan: subscription.plan,
          }
        : null,
      quotas: {
        branches: {
          used: branchCount,
          max: entitlements.maxBranches ?? 3,
          isUnlimited: entitlements.maxBranches === -1,
          hasReachedLimit: entitlements.maxBranches !== -1 && branchCount >= (entitlements.maxBranches ?? 3),
        },
        offers: {
          used: activeOfferCount,
          max: entitlements.maxActiveOffers ?? 7,
          isUnlimited: entitlements.maxActiveOffers === -1,
          hasReachedLimit: entitlements.maxActiveOffers !== -1 && activeOfferCount >= (entitlements.maxActiveOffers ?? 7),
        },
        featuredBoosts: {
          allowed: entitlements.featuredBoostCount ?? 0,
        },
      },
    };
  }
}

