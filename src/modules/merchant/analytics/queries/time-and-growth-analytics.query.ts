import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class TimeAndGrowthAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async executeTimeBased(merchantId: string, startDate: Date, endDate: Date) {
    const hourlyRedemptions = await this.prisma.$queryRaw<Array<{ hour: number; redemptionCount: bigint }>>`
      SELECT 
        EXTRACT(HOUR FROM rs."redeemed_at") as hour,
        COUNT(*) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
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
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
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
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY TO_CHAR(rs."redeemed_at", 'Mon')
      ORDER BY month ASC
    `;

    return {
      hourlyRedemptions: hourlyRedemptions.map((h) => ({
        hour: Number(h.hour),
        redemptionCount: Number(h.redemptionCount),
      })),
      dayOfWeekPerformance: dayOfWeekPerformance.map((d) => ({
        day: d.day.trim(),
        redemptionCount: Number(d.redemptionCount),
        revenue: Number(d.revenue),
      })),
      seasonalTrends: seasonalTrends.map((s) => ({
        month: s.month,
        redemptionCount: Number(s.redemptionCount),
        revenue: Number(s.revenue),
      })),
    };
  }

  async executeGrowth(merchantId: string, startDate: Date, endDate: Date) {
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
        JOIN "offers" o ON rs."offer_id" = o.id
        WHERE o."merchant_id" = ${merchantId}
          AND rs.status = 'REDEEMED'
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
      growthRate:
        i > 0 && Number(m.prev_revenue) > 0
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
        JOIN "offers" o ON rs."offer_id" = o.id
        WHERE o."merchant_id" = ${merchantId}
          AND rs.status = 'REDEEMED'
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
      growthRate:
        i > 0 && Number(y.prev_revenue) > 0
          ? ((Number(y.revenue) - Number(y.prev_revenue)) / Number(y.prev_revenue)) * 100
          : 0,
    }));

    const recentRedemptions = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const recentRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."original_price_npr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
    `;

    const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
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
      where: {
        offer: { merchantId },
        status: 'REDEEMED',
      },
    });

    const milestones = [
      { milestone: '100 Redemptions', achieved: totalRedemptions >= 100 },
      { milestone: '500 Redemptions', achieved: totalRedemptions >= 500 },
      { milestone: '1000 Redemptions', achieved: totalRedemptions >= 1000 },
      { milestone: '5000 Redemptions', achieved: totalRedemptions >= 5000 },
    ];

    return {
      momGrowth: momGrowthWithRate,
      yoyComparison: yoyComparisonWithRate,
      projections,
      milestones,
    };
  }
}
