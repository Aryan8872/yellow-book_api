import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class CategoryAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async execute(merchantId: string, startDate: Date, endDate: Date) {
    const categoryRanking = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      redemptionCount: bigint;
      revenue: bigint;
      averageOrderValue: bigint;
    }>>`
      SELECT 
        c.id as "categoryId",
        c.name as "categoryName",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."original_price_npr"), 0) as revenue,
        COALESCE(AVG(o."original_price_npr"), 0) as "averageOrderValue"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "categories" c ON o."category_id" = c.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
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
        c.id as "categoryId",
        c.name as "categoryName",
        DATE(rs."redeemed_at") as date,
        COUNT(*) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN "offers" o ON rs."offer_id" = o.id
      JOIN "categories" c ON o."category_id" = c.id
      WHERE o."merchant_id" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemed_at" >= ${startDate}
        AND rs."redeemed_at" <= ${endDate}
      GROUP BY c.id, c.name, DATE(rs."redeemed_at")
      ORDER BY date ASC
    `;

    const crossCategoryBehavior = await this.prisma.$queryRaw<Array<{
      fromCategory: string;
      toCategory: string;
      customerCount: bigint;
    }>>`
      WITH user_categories AS (
        SELECT 
          rs."user_id",
          c.name as category,
          ROW_NUMBER() OVER (PARTITION BY rs."user_id" ORDER BY rs."redeemed_at") as rn
        FROM "redemption_sessions" rs
        JOIN "offers" o ON rs."offer_id" = o.id
        JOIN "categories" c ON o."category_id" = c.id
        WHERE o."merchant_id" = ${merchantId}
          AND rs.status = 'REDEEMED'
      ),
      category_transitions AS (
        SELECT 
          c1.category as "fromCategory",
          c2.category as "toCategory",
          COUNT(*) as "customerCount"
        FROM user_categories c1
        JOIN user_categories c2 ON c1."user_id" = c2."user_id" AND c1.rn + 1 = c2.rn
        WHERE c1.category != c2.category
        GROUP BY c1.category, c2.category
      )
      SELECT * FROM category_transitions
      ORDER BY "customerCount" DESC
      LIMIT 10
    `;

    return {
      categoryRanking: categoryRanking.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        redemptionCount: Number(c.redemptionCount),
        revenue: Number(c.revenue),
        averageOrderValue: Number(c.averageOrderValue),
      })),
      categoryTrends: categoryTrends.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        date: c.date,
        redemptionCount: Number(c.redemptionCount),
      })),
      crossCategoryBehavior: crossCategoryBehavior.map((c) => ({
        fromCategory: c.fromCategory,
        toCategory: c.toCategory,
        customerCount: Number(c.customerCount),
      })),
    };
  }
}
