import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class RevenueAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async execute(merchantId: string, startDate: Date, endDate: Date) {
    const totalRevenueResult = await this.prisma.$queryRaw<Array<{ totalRevenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as "totalRevenue"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const totalRevenue = Number(totalRevenueResult[0]?.totalRevenue || 0);

    const revenueByOffer = await this.prisma.$queryRaw<Array<{
      offerId: string;
      offerTitle: string;
      revenue: bigint;
      redemptionCount: bigint;
    }>>`
      SELECT 
        o.id as "offerId",
        o.title as "offerTitle",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY o.id, o.title
      ORDER BY revenue DESC
      LIMIT 10
    `;

    const revenueByBranch = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      revenue: bigint;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "merchant_branches" b ON rs."branch_id" = b.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY revenue DESC
    `;

    const avgOrderValueResult = await this.prisma.$queryRaw<Array<{ avgOrderValue: bigint }>>`
      SELECT COALESCE(AVG(o."original_price_npr"), 0) as "avgOrderValue"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
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
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${lastMonthStart}
        AND rs."redeemed_at" <= ${lastMonthEnd}
    `;

    const lastYearRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
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
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    return {
      totalRevenue,
      revenueByOffer: revenueByOffer.map((r) => ({
        offerId: r.offerId,
        offerTitle: r.offerTitle,
        revenue: Number(r.revenue),
        redemptionCount: Number(r.redemptionCount),
      })),
      revenueByBranch: revenueByBranch.map((r) => ({
        branchId: r.branchId,
        branchName: r.branchName,
        revenue: Number(r.revenue),
        redemptionCount: Number(r.redemptionCount),
      })),
      averageOrderValue,
      revenueGrowth: { mom, yoy },
      revenueTrend: revenueTrend.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue),
      })),
    };
  }
}
