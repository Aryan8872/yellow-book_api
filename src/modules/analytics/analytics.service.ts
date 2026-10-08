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
        DATE("redeemedAt") as date,
        COUNT(*) as count
      FROM "redemption_sessions"
      WHERE "status" = 'REDEEMED'
        AND "redeemedAt" >= ${startDate}
        AND "redeemedAt" <= ${endDate}
      GROUP BY DATE("redeemedAt")
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
        DATE_TRUNC('week', "redeemedAt") as week,
        COUNT(*) as count
      FROM "redemption_sessions"
      WHERE "status" = 'REDEEMED'
        AND "redeemedAt" >= ${startDate}
        AND "redeemedAt" <= ${endDate}
      GROUP BY DATE_TRUNC('week', "redeemedAt")
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
        o."originalPriceNpr",
        COUNT(rs.id) as "redemptionCount"
      FROM offers o
      JOIN "redemption_sessions" rs ON rs."offerId" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY o.id, o.title, o."originalPriceNpr"
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
        COUNT(DISTINCT rs."offerId") as "uniqueOffersClaimed"
      FROM merchants m
      JOIN offers o ON o."merchantId" = m.id
      JOIN "redemption_sessions" rs ON rs."offerId" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
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
        SUM(o."originalPriceNpr") as "totalRevenue"
      FROM merchants m
      JOIN offers o ON o."merchantId" = m.id
      JOIN "redemption_sessions" rs ON rs."offerId" = o.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
        AND o."originalPriceNpr" IS NOT NULL
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
        DATE(rs."redeemedAt") as date,
        c.name as category,
        COUNT(*) as count
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN categories c ON o."categoryId" = c.id
      WHERE rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY DATE(rs."redeemedAt"), c.name
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
}
