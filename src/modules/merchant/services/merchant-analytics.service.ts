import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CacheService } from '../../../infrastructure/cache/cache.service';
import { TimeRangeDto } from '../../analytics/dto/time-range.dto';
import { AuthenticatedUser } from '../../auth/auth.types';

// Modular Analytical Queries & Utils
import { calculateTimeRange } from '../analytics/utils/time-range.util';
import { RevenueAnalyticsQuery } from '../analytics/queries/revenue-analytics.query';
import { CustomerAnalyticsQuery } from '../analytics/queries/customer-analytics.query';
import { OfferPerformanceAnalyticsQuery } from '../analytics/queries/offer-performance-analytics.query';
import { BranchPerformanceAnalyticsQuery } from '../analytics/queries/branch-performance-analytics.query';
import { TimeAndGrowthAnalyticsQuery } from '../analytics/queries/time-and-growth-analytics.query';
import { CategoryAnalyticsQuery } from '../analytics/queries/category-analytics.query';

@Injectable()
export class MerchantAnalyticsService {
  // Cache TTL for analytics read aggregations: 60 seconds (prevents 429 & reduces DB load)
  private readonly ANALYTICS_CACHE_TTL = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly revenueQuery: RevenueAnalyticsQuery,
    private readonly customerQuery: CustomerAnalyticsQuery,
    private readonly offerQuery: OfferPerformanceAnalyticsQuery,
    private readonly branchQuery: BranchPerformanceAnalyticsQuery,
    private readonly timeAndGrowthQuery: TimeAndGrowthAnalyticsQuery,
    private readonly categoryQuery: CategoryAnalyticsQuery,
  ) {}

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

  private buildCacheKey(subdomain: string, merchantId: string, dto: TimeRangeDto): string {
    const range = dto.range || '30d';
    const start = dto.startDate || '';
    const end = dto.endDate || '';
    return `merchant:analytics:${subdomain}:${merchantId}:${range}:${start}:${end}`;
  }

  async getMerchantAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('overview', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);

        const redemptions = await this.prisma.redemptionSession.findMany({
          where: {
            offer: { merchantId },
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            offer: {
              select: {
                id: true,
                title: true,
                category: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        const dailyRedemptions: Record<string, number> = {};
        redemptions.forEach((r) => {
          const date = r.createdAt.toISOString().split('T')[0];
          dailyRedemptions[date] = (dailyRedemptions[date] || 0) + 1;
        });

        const offerPerformance: Record<string, number> = {};
        redemptions.forEach((r) => {
          offerPerformance[r.offer.title] = (offerPerformance[r.offer.title] || 0) + 1;
        });

        return {
          totalRedemptions: redemptions.length,
          dailyRedemptions: Object.entries(dailyRedemptions).map(([date, count]) => ({
            date,
            count,
          })),
          topOffers: Object.entries(offerPerformance)
            .map(([title, count]) => ({ title, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        };
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantRevenueAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('revenue', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.revenueQuery.execute(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantCustomerAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('customers', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.customerQuery.execute(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantOfferPerformanceAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('offers', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.offerQuery.execute(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantBranchPerformanceAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('branches', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.branchQuery.execute(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantTimeBasedAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('time', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.timeAndGrowthQuery.executeTimeBased(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantGrowthMetrics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('growth', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.timeAndGrowthQuery.executeGrowth(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }

  async getMerchantCategoryAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const cacheKey = this.buildCacheKey('categories', merchantId, dto);

    return this.cache.wrap(
      cacheKey,
      async () => {
        const { startDate, endDate } = calculateTimeRange(dto);
        return this.categoryQuery.execute(merchantId, startDate, endDate);
      },
      this.ANALYTICS_CACHE_TTL,
    );
  }
}
