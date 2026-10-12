import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class CustomerAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async execute(merchantId: string, startDate: Date, endDate: Date) {
    const newCustomersResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."user_id") as count
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND rs."user_id" NOT IN (
          SELECT DISTINCT rs2."user_id"
          FROM "redemption_sessions" rs2
          JOIN "offers" o2 ON rs2."offer_id" = o2.id
          WHERE o2."merchant_id" = ${merchantId}
            AND rs2.status = 'REDEEMED'
            AND rs2."redeemed_at" < ${startDate}
        )
    `;

    const returningCustomersResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."user_id") as count
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
        AND rs."user_id" IN (
          SELECT DISTINCT rs2."user_id"
          FROM "redemption_sessions" rs2
          JOIN "offers" o2 ON rs2."offer_id" = o2.id
          WHERE o2."merchant_id" = ${merchantId}
            AND rs2.status = 'REDEEMED'
            AND rs2."redeemed_at" < ${startDate}
        )
    `;

    const newCustomers = Number(newCustomersResult[0]?.count || 0);
    const returningCustomers = Number(returningCustomersResult[0]?.count || 0);
    const totalCustomers = newCustomers + returningCustomers;
    const retentionRate = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0;

    const topCustomers = await this.prisma.$queryRaw<Array<{
      userId: string;
      userName: string;
      userEmail: string;
      redemptionCount: bigint;
      totalSpent: bigint;
    }>>`
      SELECT 
        u.id as "userId",
        u.name as "userName",
        u.email as "userEmail",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as "totalSpent"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "users" u ON rs."user_id" = u.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY u.id, u.name, u.email
      ORDER BY "redemptionCount" DESC
      LIMIT 10
    `;

    const customerAcquisitionTrend = await this.prisma.$queryRaw<Array<{ date: string; newCustomers: bigint }>>`
      SELECT 
        DATE(rs."redeemed_at") as date,
        COUNT(DISTINCT rs."user_id") as "newCustomers"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    const geographicDistribution = await this.prisma.$queryRaw<Array<{ city: string; customerCount: bigint }>>`
      SELECT 
        COALESCE(b.district::text, 'Kathmandu') as city,
        COUNT(DISTINCT rs."user_id") as "customerCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      LEFT JOIN "merchant_branches" b ON rs."branch_id" = b.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY b.district
      ORDER BY "customerCount" DESC
      LIMIT 10
    `;

    return {
      newCustomers,
      returningCustomers,
      retentionRate,
      topCustomers: topCustomers.map((c) => ({
        userId: c.userId,
        userName: c.userName,
        userEmail: c.userEmail,
        redemptionCount: Number(c.redemptionCount),
        totalSpent: Number(c.totalSpent),
      })),
      customerAcquisitionTrend: customerAcquisitionTrend.map((c) => ({
        date: c.date,
        newCustomers: Number(c.newCustomers),
      })),
      geographicDistribution: geographicDistribution.map((g) => ({
        city: g.city,
        customerCount: Number(g.customerCount),
      })),
    };
  }
}
