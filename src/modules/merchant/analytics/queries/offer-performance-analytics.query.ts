import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class OfferPerformanceAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async execute(merchantId: string, startDate: Date, endDate: Date) {
    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
        status: 'REDEEMED',
        redeemedAt: { gte: startDate, lte: endDate },
      },
    });

    const totalViews = await this.prisma.offer.aggregate({
      where: { merchantId },
      _sum: { viewCount: true },
    });

    const totalViewCount = Number(totalViews._sum.viewCount || 0);
    const conversionRate = totalViewCount > 0 ? (totalRedemptions / totalViewCount) * 100 : 0;

    const avgDiscountResult = await this.prisma.$queryRaw<Array<{ avgDiscount: bigint }>>`
      SELECT COALESCE(AVG(o."estimated_savings_npr"), 0) as "avgDiscount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const averageDiscountValue = Number(avgDiscountResult[0]?.avgDiscount || 0);
    const engagementRate = totalViewCount > 0 ? (totalRedemptions / totalViewCount) * 100 : 0;

    const topCategories = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        c.id as "categoryId",
        c.name as "categoryName",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "categories" c ON o."category_id" = c.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY "redemptionCount" DESC
      LIMIT 10
    `;

    const expiredOffers = await this.prisma.offer.count({
      where: {
        merchantId,
        validUntil: { lt: new Date() },
      },
    });

    const nearExpiringOffers = await this.prisma.offer.count({
      where: {
        merchantId,
        validUntil: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const expiredRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
        status: 'EXPIRED',
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    return {
      conversionRate,
      averageDiscountValue,
      engagementRate,
      topCategories: topCategories.map((c) => ({
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
}
