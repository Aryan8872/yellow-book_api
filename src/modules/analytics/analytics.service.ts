import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TimeRangeDto, TimeRange } from './dto/time-range.dto';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  getTimeRange(dto: TimeRangeDto): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    let startDate: Date;

    if (dto.range === TimeRange.LAST_7_DAYS) {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (dto.range === TimeRange.LAST_30_DAYS) {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    } else if (dto.range === TimeRange.LAST_90_DAYS) {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
      startDate.setHours(0, 0, 0, 0);
    } else if (dto.range === TimeRange.CUSTOM) {
      if (!dto.startDate || !dto.endDate) {
        throw new BadRequestException('Custom range requires startDate and endDate');
      }
      startDate = new Date(dto.startDate);
      const customEndDate = new Date(dto.endDate);
      if (startDate > customEndDate) {
        throw new BadRequestException('startDate must be before endDate');
      }
      return { startDate, endDate: customEndDate };
    } else {
      // Default to 7 days if invalid range
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    }

    return { startDate, endDate };
  }

  async getRedemptionTrendsDaily(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const results = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT 
        DATE("redeemed_at") as date,
        COUNT(*) as count
      FROM "redemption_sessions"
      WHERE "status" = 'REDEEMED'
        AND "redeemed_at" >= ${startDate}
        AND "redeemed_at" <= ${endDate}
      GROUP BY DATE("redeemed_at")
      ORDER BY date ASC
    `;

    // Fill in missing dates with 0
    const dateMap = new Map<string, number>();
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dateMap.set(dateStr, 0);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    results.forEach((row) => {
      dateMap.set(row.date, Number(row.count));
    });

    const labels = Array.from(dateMap.keys()).sort();
    const data = labels.map((label) => dateMap.get(label) || 0);

    return {
      labels,
      datasets: [{
        label: 'Redemptions',
        data,
        backgroundColor: '#6366f1',
      }],
    };
  }

  async getRedemptionTrendsWeekly(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const results = await this.prisma.$queryRaw<Array<{ week: string; count: bigint }>>`
      SELECT 
        DATE_TRUNC('week', "redeemed_at") as week,
        COUNT(*) as count
      FROM "redemption_sessions"
      WHERE "status" = 'REDEEMED'
        AND "redeemed_at" >= ${startDate}
        AND "redeemed_at" <= ${endDate}
      GROUP BY DATE_TRUNC('week', "redeemed_at")
      ORDER BY week ASC
    `;

    const labels = results.map((row) => row.week.split('T')[0]);
    const data = results.map((row) => Number(row.count));

    return {
      labels,
      datasets: [{
        label: 'Redemptions (Weekly)',
        data,
        backgroundColor: '#6366f1',
      }],
    };
  }

  async getTopOffers(dto: TimeRangeDto, limit: number = 10) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      originalPriceNpr: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        o.id,
        o.title,
        o."original_price_npr",
        COUNT(rs.id) as "redemptionCount"
      FROM offers o
      JOIN "redemption_sessions" rs ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY o.id, o.title, o."original_price_npr"
      ORDER BY "redemptionCount" DESC
      LIMIT ${limit}
    `;

    return {
      offers: results.map((row) => ({
        id: row.id,
        title: row.title,
        originalPriceNpr: row.originalPriceNpr ? Number(row.originalPriceNpr) : null,
        redemptionCount: Number(row.redemptionCount),
      })),
    };
  }

  async getTrendingMerchants(dto: TimeRangeDto, limit: number = 10) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      totalRedemptions: bigint;
      uniqueOffersClaimed: bigint;
    }>>`
      SELECT 
        m.id,
        m.name,
        COUNT(rs.id) as "totalRedemptions",
        COUNT(DISTINCT rs."offer_id") as "uniqueOffersClaimed"
      FROM merchants m
      JOIN offers o ON o."merchant_id" = m.id
      JOIN "redemption_sessions" rs ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY m.id, m.name
      ORDER BY "totalRedemptions" DESC
      LIMIT ${limit}
    `;

    return {
      merchants: results.map((row) => ({
        id: row.id,
        name: row.name,
        totalRedemptions: Number(row.totalRedemptions),
        uniqueOffersClaimed: Number(row.uniqueOffersClaimed),
      })),
    };
  }

  async getMerchantRevenue(dto: TimeRangeDto, limit: number = 20) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const results = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      redemptionCount: bigint;
      totalRevenue: string;
    }>>`
      SELECT 
        m.id,
        m.name,
        COUNT(rs.id) as "redemptionCount",
        SUM(o."original_price_npr") as "totalRevenue"
      FROM merchants m
      JOIN offers o ON o."merchant_id" = m.id
      JOIN "redemption_sessions" rs ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND o."original_price_npr" IS NOT NULL
      GROUP BY m.id, m.name
      ORDER BY "totalRevenue" DESC
      LIMIT ${limit}
    `;

    return {
      merchants: results.map((row) => ({
        id: row.id,
        name: row.name,
        redemptionCount: Number(row.redemptionCount),
        totalRevenue: row.totalRevenue ? Number(row.totalRevenue) : 0,
      })),
    };
  }

  async getCategoryTrends(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const results = await this.prisma.$queryRaw<Array<{
      date: string;
      category: string;
      count: bigint;
    }>>`
      SELECT 
        DATE(rs."redeemed_at") as date,
        c.name as category,
        COUNT(*) as count
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN categories c ON o."category_id" = c.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY DATE(rs."redeemed_at"), c.name
      ORDER BY date ASC, category ASC
    `;

    // Get all unique dates and categories
    const dates = [...new Set(results.map((r) => r.date))].sort();
    const categories = [...new Set(results.map((r) => r.category))];

    // Build datasets for each category
    const datasets = categories.map((category) => {
      const data = dates.map((date) => {
        const row = results.find((r) => r.date === date && r.category === category);
        return row ? Number(row.count) : 0;
      });
      
      // Assign colors based on category
      const colors: Record<string, string> = {
        'Dining': '#6366f1',
        'Wellness': '#10b981',
        'Entertainment': '#f59e0b',
        'Retail': '#ef4444',
        'Travel': '#8b5cf6',
        'Beauty': '#ec4899',
      };
      
      return {
        label: category,
        data,
        borderColor: colors[category] || '#6366f1',
        backgroundColor: colors[category] || '#6366f1',
      };
    });

    return {
      labels: dates,
      datasets,
    };
  }

  // Platform-wide analytics methods for admin panel

  async getPlatformRevenueAnalytics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const totalRevenueResult = await this.prisma.$queryRaw<Array<{ totalRevenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as "totalRevenue"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const totalRevenue = Number(totalRevenueResult[0]?.totalRevenue || 0);

    const revenueByMerchant = await this.prisma.$queryRaw<Array<{
      merchantId: string;
      merchantName: string;
      revenue: bigint;
      redemptionCount: bigint;
    }>>`
      SELECT 
        m.id as "merchant_id",
        m.name as "merchantName",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN merchants m ON o."merchant_id" = m.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY m.id, m.name
      ORDER BY revenue DESC
      LIMIT 10
    `;

    const revenueByCategory = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      revenue: bigint;
      redemptionCount: bigint;
    }>>`
      SELECT 
        c.id as "category_id",
        c.name as "categoryName",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN categories c ON o."category_id" = c.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;

    const avgOrderValueResult = await this.prisma.$queryRaw<Array<{ avgOrderValue: bigint }>>`
      SELECT COALESCE(AVG(o."original_price_npr"), 0) as "avgOrderValue"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND o."original_price_npr" IS NOT NULL
    `;

    const averageOrderValue = Number(avgOrderValueResult[0]?.avgOrderValue || 0);

    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);

    const lastMonthRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${lastMonthStart}
        AND rs."redeemed_at" <= ${lastMonthEnd}
    `;

    const lastYearRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${lastYearStart}
        AND rs."redeemed_at" <= ${lastYearEnd}
    `;

    const mom = Number(lastMonthRevenue[0]?.revenue || 0) > 0
      ? ((totalRevenue - Number(lastMonthRevenue[0]?.revenue || 0)) / Number(lastMonthRevenue[0]?.revenue || 1)) * 100
      : 0;
    const yoy = Number(lastYearRevenue[0]?.revenue || 0) > 0
      ? ((totalRevenue - Number(lastYearRevenue[0]?.revenue || 0)) / Number(lastYearRevenue[0]?.revenue || 1)) * 100
      : 0;

    const revenueTrend = await this.prisma.$queryRaw<Array<{ date: string; revenue: bigint }>>`
      SELECT 
        DATE(rs."redeemed_at") as date,
        COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    return {
      totalRevenue,
      revenueByMerchant: revenueByMerchant.map(r => ({
        merchantId: r.merchantId,
        merchantName: r.merchantName,
        revenue: Number(r.revenue),
        redemptionCount: Number(r.redemptionCount),
      })),
      revenueByCategory: revenueByCategory.map(r => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        revenue: Number(r.revenue),
        redemptionCount: Number(r.redemptionCount),
      })),
      averageOrderValue,
      revenueGrowth: { mom, yoy },
      revenueTrend: revenueTrend.map(r => ({
        date: r.date,
        revenue: Number(r.revenue),
      })),
    };
  }

  async getPlatformCustomerAnalytics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const totalUsers = await this.prisma.user.count({ where: { isActive: true } });
    const activeUsers = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."user_id") as count
      FROM "redemption_sessions" rs
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const newUsersResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."user_id") as count
      FROM "redemption_sessions" rs
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND rs."user_id" NOT IN (
          SELECT DISTINCT rs2."user_id"
          FROM "redemption_sessions" rs2
          WHERE rs2.status = 'REDEEMED'
            AND rs2."redeemed_at" < ${startDate}
        )
    `;

    const returningUsersResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."user_id") as count
      FROM "redemption_sessions" rs
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND rs."user_id" IN (
          SELECT DISTINCT rs2."user_id"
          FROM "redemption_sessions" rs2
          WHERE rs2.status = 'REDEEMED'
            AND rs2."redeemed_at" < ${startDate}
        )
    `;

    const newUsers = Number(newUsersResult[0]?.count || 0);
    const returningUsers = Number(returningUsersResult[0]?.count || 0);
    const activeUsersCount = Number(activeUsers[0]?.count || 0);
    const userRetentionRate = activeUsersCount > 0 ? (returningUsers / activeUsersCount) * 100 : 0;

    const topUsers = await this.prisma.$queryRaw<Array<{
      userId: string;
      userName: string;
      userEmail: string;
      redemptionCount: bigint;
      totalSpent: bigint;
    }>>`
      SELECT 
        u.id as "user_id",
        u.name as "userName",
        u.email as "userEmail",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as "totalSpent"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN users u ON rs."user_id" = u.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY u.id, u.name, u.email
      ORDER BY "redemptionCount" DESC
      LIMIT 10
    `;

    const userAcquisitionTrend = await this.prisma.$queryRaw<Array<{ date: string; newUsers: bigint }>>`
      SELECT 
        DATE(rs."redeemed_at") as date,
        COUNT(DISTINCT rs."user_id") as "newUsers"
      FROM "redemption_sessions" rs
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    const geographicDistribution = await this.prisma.$queryRaw<Array<{ city: string; userCount: bigint }>>`
      SELECT 
        u.city,
        COUNT(DISTINCT u.id) as "userCount"
      FROM "redemption_sessions" rs
      JOIN users u ON rs."user_id" = u.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND u.city IS NOT NULL
      GROUP BY u.city
      ORDER BY "userCount" DESC
      LIMIT 10
    `;

    return {
      totalUsers,
      activeUsers: activeUsersCount,
      newUsers,
      returningUsers,
      userRetentionRate,
      topUsers: topUsers.map(c => ({
        userId: c.userId,
        userName: c.userName,
        userEmail: c.userEmail,
        redemptionCount: Number(c.redemptionCount),
        totalSpent: Number(c.totalSpent),
      })),
      userAcquisitionTrend: userAcquisitionTrend.map(c => ({
        date: c.date,
        newUsers: Number(c.newUsers),
      })),
      geographicDistribution: geographicDistribution.map(g => ({
        city: g.city,
        userCount: Number(g.userCount),
      })),
    };
  }

  async getPlatformOfferPerformanceAnalytics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const totalOffers = await this.prisma.offer.count({ where: { isActive: true } });
    const activeOffers = await this.prisma.offer.count({ where: { isActive: true, validUntil: { gte: new Date() } } });

    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: { status: 'REDEEMED', redeemedAt: { gte: startDate, lte: endDate } },
    });

    const totalViews = await this.prisma.offer.aggregate({
      _sum: { viewCount: true },
    });

    const totalViewCount = Number(totalViews._sum.viewCount || 0);
    const conversionRate = totalViewCount > 0 ? (totalRedemptions / totalViewCount) * 100 : 0;
    const engagementRate = totalViewCount > 0 ? (totalRedemptions / totalViewCount) * 100 : 0;

    const avgDiscountResult = await this.prisma.$queryRaw<Array<{ avgDiscount: bigint }>>`
      SELECT COALESCE(AVG(o."original_price_npr" - o."discounted_price_npr"), 0) as "avgDiscount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const averageDiscountValue = Number(avgDiscountResult[0]?.avgDiscount || 0);

    const topCategories = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        c.id as "category_id",
        c.name as "categoryName",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN categories c ON o."category_id" = c.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY "redemptionCount" DESC
      LIMIT 10
    `;

    const expiredOffers = await this.prisma.offer.count({
      where: { validUntil: { lt: new Date() } },
    });

    const nearExpiringOffers = await this.prisma.offer.count({
      where: {
        validUntil: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const expiredRedemptions = await this.prisma.redemptionSession.count({
      where: { status: 'EXPIRED', createdAt: { gte: startDate, lte: endDate } },
    });

    return {
      totalOffers,
      activeOffers,
      conversionRate,
      averageDiscountValue,
      engagementRate,
      topCategories: topCategories.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        redemptionCount: Number(c.redemptionCount),
        revenue: Number(c.revenue),
      })),
      expirationImpact: [
        { expiredOffers, nearExpiringOffers, expiredRedemptions },
      ],
    };
  }

  async getPlatformMerchantPerformanceAnalytics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const totalMerchants = await this.prisma.merchant.count();
    const activeMerchants = await this.prisma.merchant.count({ where: { status: 'ACTIVE' } });
    const pendingMerchants = await this.prisma.merchant.count({ where: { status: 'PENDING_REVIEW' } });

    const merchantComparison = await this.prisma.$queryRaw<Array<{
      merchantId: string;
      merchantName: string;
      totalRedemptions: bigint;
      totalRevenue: bigint;
      activeOffers: bigint;
    }>>`
      SELECT 
        m.id as "merchant_id",
        m.name as "merchantName",
        COUNT(rs.id) as "totalRedemptions",
        COALESCE(SUM(o."original_price_npr"), 0) as "totalRevenue",
        COUNT(DISTINCT o.id) as "activeOffers"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN merchants m ON o."merchant_id" = m.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY m.id, m.name
      ORDER BY "totalRedemptions" DESC
    `;

    const mostActiveMerchant = await this.prisma.$queryRaw<Array<{
      merchantId: string;
      merchantName: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        m.id as "merchant_id",
        m.name as "merchantName",
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN merchants m ON o."merchant_id" = m.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY m.id, m.name
      ORDER BY "redemptionCount" DESC
      LIMIT 1
    `;

    const leastActiveMerchant = await this.prisma.$queryRaw<Array<{
      merchantId: string;
      merchantName: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        m.id as "merchant_id",
        m.name as "merchantName",
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN merchants m ON o."merchant_id" = m.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY m.id, m.name
      ORDER BY "redemptionCount" ASC
      LIMIT 1
    `;

    const merchantTrends = await this.prisma.$queryRaw<Array<{
      merchantId: string;
      merchantName: string;
      date: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        m.id as "merchant_id",
        m.name as "merchantName",
        DATE(rs."redeemed_at") as date,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN merchants m ON o."merchant_id" = m.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY m.id, m.name, DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    return {
      totalMerchants,
      activeMerchants,
      pendingMerchants,
      merchantComparison: merchantComparison.map(b => ({
        merchantId: b.merchantId,
        merchantName: b.merchantName,
        totalRedemptions: Number(b.totalRedemptions),
        totalRevenue: Number(b.totalRevenue),
        activeOffers: Number(b.activeOffers),
      })),
      mostActiveMerchant: mostActiveMerchant[0] ? {
        merchantId: mostActiveMerchant[0].merchantId,
        merchantName: mostActiveMerchant[0].merchantName,
        redemptionCount: Number(mostActiveMerchant[0].redemptionCount),
      } : null,
      leastActiveMerchant: leastActiveMerchant[0] ? {
        merchantId: leastActiveMerchant[0].merchantId,
        merchantName: leastActiveMerchant[0].merchantName,
        redemptionCount: Number(leastActiveMerchant[0].redemptionCount),
      } : null,
      merchantTrends: merchantTrends.map(t => ({
        merchantId: t.merchantId,
        merchantName: t.merchantName,
        date: t.date,
        redemptionCount: Number(t.redemptionCount),
      })),
    };
  }

  async getPlatformTimeBasedAnalytics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const hourlyRedemptions = await this.prisma.$queryRaw<Array<{ hour: number; redemptionCount: bigint }>>`
      SELECT 
        EXTRACT(HOUR FROM rs."redeemed_at") as hour,
        COUNT(*) as "redemptionCount"
      FROM "redemption_sessions" rs
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY EXTRACT(HOUR FROM rs."redeemed_at")
      ORDER BY hour ASC
    `;

    const dayOfWeekPerformance = await this.prisma.$queryRaw<Array<{
      day: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        TO_CHAR(rs."redeemed_at", 'Day') as day,
        COUNT(*) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY TO_CHAR(rs."redeemed_at", 'Day')
      ORDER BY "redemptionCount" DESC
    `;

    const seasonalTrends = await this.prisma.$queryRaw<Array<{
      month: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        TO_CHAR(rs."redeemed_at", 'Mon') as month,
        COUNT(*) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY TO_CHAR(rs."redeemed_at", 'Mon')
      ORDER BY month ASC
    `;

    return {
      hourlyRedemptions: hourlyRedemptions.map(h => ({
        hour: Number(h.hour),
        redemptionCount: Number(h.redemptionCount),
      })),
      dayOfWeekPerformance: dayOfWeekPerformance.map(d => ({
        day: d.day.trim(),
        redemptionCount: Number(d.redemptionCount),
        revenue: Number(d.revenue),
      })),
      seasonalTrends: seasonalTrends.map(s => ({
        month: s.month,
        redemptionCount: Number(s.redemptionCount),
        revenue: Number(s.revenue),
      })),
    };
  }

  async getPlatformGrowthMetrics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const momGrowth = await this.prisma.$queryRaw<Array<{
      date: string;
      redemptions: bigint;
      revenue: bigint;
      prev_revenue: bigint | null;
      growthRate: number;
    }>>`
      WITH monthly_data AS (
        SELECT 
          DATE_TRUNC('month', rs."redeemed_at") as month,
          COUNT(*) as redemptions,
          COALESCE(SUM(o."original_price_npr"), 0) as revenue
        FROM "redemption_sessions" rs
        JOIN offers o ON rs."offer_id" = o.id
        WHERE rs.status = 'REDEEMED'
          AND rs."redeemed_at" >= ${startDate}
          AND rs."redeemed_at" <= ${endDate}
        GROUP BY DATE_TRUNC('month', rs."redeemed_at")
      )
      SELECT 
        TO_CHAR(month, 'YYYY-MM') as date,
        redemptions,
        revenue,
        LAG(revenue) OVER (ORDER BY month) as prev_revenue
      FROM monthly_data
      ORDER BY month ASC
    `;

    const momGrowthWithRate = momGrowth.map((m, i) => ({
      date: m.date,
      redemptions: Number(m.redemptions),
      revenue: Number(m.revenue),
      growthRate: i > 0 && Number(m.prev_revenue) > 0
        ? ((Number(m.revenue) - Number(m.prev_revenue)) / Number(m.prev_revenue)) * 100
        : 0,
    }));

    const yoyComparison = await this.prisma.$queryRaw<Array<{
      year: number;
      redemptions: bigint;
      revenue: bigint;
      prev_revenue: bigint | null;
      growthRate: number;
    }>>`
      WITH yearly_data AS (
        SELECT 
          EXTRACT(YEAR FROM rs."redeemed_at") as year,
          COUNT(*) as redemptions,
          COALESCE(SUM(o."original_price_npr"), 0) as revenue
        FROM "redemption_sessions" rs
        JOIN offers o ON rs."offer_id" = o.id
        WHERE rs.status = 'REDEEMED'
          AND rs."redeemed_at" >= ${startDate}
          AND rs."redeemed_at" <= ${endDate}
        GROUP BY EXTRACT(YEAR FROM rs."redeemed_at")
      )
      SELECT 
        year,
        redemptions,
        revenue,
        LAG(revenue) OVER (ORDER BY year) as prev_revenue
      FROM yearly_data
      ORDER BY year ASC
    `;

    const yoyComparisonWithRate = yoyComparison.map((y, i) => ({
      year: Number(y.year),
      redemptions: Number(y.redemptions),
      revenue: Number(y.revenue),
      growthRate: i > 0 && Number(y.prev_revenue) > 0
        ? ((Number(y.revenue) - Number(y.prev_revenue)) / Number(y.prev_revenue)) * 100
        : 0,
    }));

    const recentRedemptions = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "redemption_sessions" rs
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const recentRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyRedemptions = Number(recentRedemptions[0]?.count || 0) / daysInRange;
    const avgDailyRevenue = Number(recentRevenue[0]?.revenue || 0) / daysInRange;

    const projections: Array<{
      date: string;
      projectedRedemptions: number;
      projectedRevenue: number;
    }> = [];
    for (let i = 1; i <= 30; i++) {
      const futureDate = new Date(endDate);
      futureDate.setDate(futureDate.getDate() + i);
      projections.push({
        date: futureDate.toISOString().split('T')[0],
        projectedRedemptions: Math.round(avgDailyRedemptions * i),
        projectedRevenue: Math.round(avgDailyRevenue * i),
      });
    }

    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: { status: 'REDEEMED' },
    });

    const milestones = [
      { milestone: '1000 Redemptions', achieved: totalRedemptions >= 1000 },
      { milestone: '5000 Redemptions', achieved: totalRedemptions >= 5000 },
      { milestone: '10000 Redemptions', achieved: totalRedemptions >= 10000 },
      { milestone: '50000 Redemptions', achieved: totalRedemptions >= 50000 },
    ];

    return {
      momGrowth: momGrowthWithRate,
      yoyComparison: yoyComparisonWithRate,
      projections,
      milestones,
    };
  }

  async getPlatformCategoryAnalytics(dto: TimeRangeDto) {
    const { startDate, endDate } = this.getTimeRange(dto);

    const categoryRanking = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      redemptionCount: bigint;
      revenue: bigint;
      averageOrderValue: bigint;
    }>>`
      SELECT 
        c.id as "category_id",
        c.name as "categoryName",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue,
        COALESCE(AVG(o."original_price_npr"), 0) as "averageOrderValue"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN categories c ON o."category_id" = c.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY "redemptionCount" DESC
    `;

    const categoryTrends = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      date: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        c.id as "category_id",
        c.name as "categoryName",
        DATE(rs."redeemed_at") as date,
        COUNT(*) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offer_id" = o.id
      JOIN categories c ON o."category_id" = c.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY c.id, c.name, DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    const crossCategoryBehavior = await this.prisma.$queryRaw<Array<{
      fromCategory: string;
      toCategory: string;
      userCount: bigint;
    }>>`
      WITH user_categories AS (
        SELECT 
          rs."user_id",
          c.name as category,
          ROW_NUMBER() OVER (PARTITION BY rs."user_id" ORDER BY rs."redeemed_at") as rn
        FROM "redemption_sessions" rs
        JOIN offers o ON rs."offer_id" = o.id
        JOIN categories c ON o."category_id" = c.id
        WHERE rs.status = 'REDEEMED'
      ),
      category_transitions AS (
        SELECT 
          c1.category as "fromCategory",
          c2.category as "toCategory",
          COUNT(*) as "userCount"
        FROM user_categories c1
        JOIN user_categories c2 ON c1."user_id" = c2."user_id" AND c1.rn + 1 = c2.rn
        WHERE c1.category != c2.category
        GROUP BY c1.category, c2.category
      )
      SELECT * FROM category_transitions
      ORDER BY "userCount" DESC
      LIMIT 10
    `;

    return {
      categoryRanking: categoryRanking.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        redemptionCount: Number(c.redemptionCount),
        revenue: Number(c.revenue),
        averageOrderValue: Number(c.averageOrderValue),
      })),
      categoryTrends: categoryTrends.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        date: c.date,
        redemptionCount: Number(c.redemptionCount),
      })),
      crossCategoryBehavior: crossCategoryBehavior.map(c => ({
        fromCategory: c.fromCategory,
        toCategory: c.toCategory,
        userCount: Number(c.userCount),
      })),
    };
  }
}
