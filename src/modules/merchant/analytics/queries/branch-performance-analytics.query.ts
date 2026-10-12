import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class BranchPerformanceAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async execute(merchantId: string, startDate: Date, endDate: Date) {
    const branchComparison = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      totalRedemptions: bigint;
      totalRevenue: bigint;
      activeOffers: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COUNT(rs.id) as "totalRedemptions",
        COALESCE(SUM(o."original_price_npr"), 0) as "totalRevenue",
        COUNT(DISTINCT o.id) as "activeOffers"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "merchant_branches" b ON rs."branch_id" = b.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY "totalRedemptions" DESC
    `;

    const mostActiveBranch = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "merchant_branches" b ON rs."branch_id" = b.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY "redemptionCount" DESC
      LIMIT 1
    `;

    const leastActiveBranch = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "merchant_branches" b ON rs."branch_id" = b.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY "redemptionCount" ASC
      LIMIT 1
    `;

    const branchTrends = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      date: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        DATE(rs."redeemed_at") as date,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "merchant_branches" b ON rs."branch_id" = b.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.id, b.name, DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    const staffEfficiency = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      staffId: string;
      staffName: string;
      redemptionsHandled: bigint;
      averageTimeToProcess: number;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        s.id as "staffId",
        u.name as "staffName",
        COUNT(rs.id) as "redemptionsHandled",
        COALESCE(AVG(EXTRACT(EPOCH FROM (rs."redeemed_at" - rs."created_at"))), 0) as "averageTimeToProcess"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "merchant_branches" b ON rs."branch_id" = b.id
      JOIN "merchant_staff" s ON rs."staff_id" = s.id
      JOIN "users" u ON s."user_id" = u.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.id, b.name, s.id, u.name
      ORDER BY "redemptionsHandled" DESC
    `;

    return {
      branchComparison: branchComparison.map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        totalRedemptions: Number(b.totalRedemptions),
        totalRevenue: Number(b.totalRevenue),
        activeOffers: Number(b.activeOffers),
      })),
      mostActiveBranch: mostActiveBranch[0]
        ? {
            branchId: mostActiveBranch[0].branchId,
            branchName: mostActiveBranch[0].branchName,
            redemptionCount: Number(mostActiveBranch[0].redemptionCount),
          }
        : null,
      leastActiveBranch: leastActiveBranch[0]
        ? {
            branchId: leastActiveBranch[0].branchId,
            branchName: leastActiveBranch[0].branchName,
            redemptionCount: Number(leastActiveBranch[0].redemptionCount),
          }
        : null,
      branchTrends: branchTrends.map((t) => ({
        branchId: t.branchId,
        branchName: t.branchName,
        date: t.date,
        redemptionCount: Number(t.redemptionCount),
      })),
      staffEfficiency: staffEfficiency.map((s) => ({
        branchId: s.branchId,
        branchName: s.branchName,
        staffId: s.staffId,
        staffName: s.staffName,
        redemptionsHandled: Number(s.redemptionsHandled),
        averageTimeToProcess: Number(s.averageTimeToProcess),
      })),
    };
  }
}
