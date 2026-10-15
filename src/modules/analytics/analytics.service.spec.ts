import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

// @nestjs/swagger ships ESM-only; mock the decorator factories so
// time-range.dto.ts loads under the CommonJS/Jest runtime (same precedent as
// list-merchant-offers.dto.spec.ts and the qrcode mock in redemption's spec).
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TimeRange } from './dto/time-range.dto';

/**
 * Covers ONLY `getPlatformGrowthMetrics` mapping math (D-07-01). The other
 * analytics methods are SQL-heavy aggregations and are intentionally untested.
 *
 * $queryRaw mocking (RESEARCH landmine 2): the four raw calls are tagged
 * templates, so a `mockResolvedValueOnce` chain would depend on call order and
 * break silently if the queries were ever reordered. Instead the mock dispatches
 * on the SQL text itself (Plan Task 8, step 5), which stays correct regardless
 * of ordering. The `monthly_data` / `yearly_data` / `COUNT(*)` markers are
 * checked before the revenue marker because the revenue SQL also appears inside
 * both CTEs.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    redemptionSession: {
      count: jest.fn(),
    },
  };

  /** Fixed 10-day window so `daysInRange` is deterministic (10, not wall-clock). */
  const customDto = {
    range: TimeRange.CUSTOM,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-11T00:00:00.000Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  /** Feeds one set of raw-SQL results, matched on SQL text rather than call order. */
  function stubRaw({
    mom = [],
    yoy = [],
    recentRedemptions = [],
    recentRevenue = [],
  }: {
    mom?: unknown[];
    yoy?: unknown[];
    recentRedemptions?: unknown[];
    recentRevenue?: unknown[];
  }) {
    mockPrisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('monthly_data')) return Promise.resolve(mom);
      if (sql.includes('yearly_data')) return Promise.resolve(yoy);
      if (sql.includes('SELECT COUNT(*)')) {
        return Promise.resolve(recentRedemptions);
      }
      return Promise.resolve(recentRevenue);
    });
  }


  describe('getPlatformGrowthMetrics — momGrowth growthRate', () => {
    it('returns 0 for the first row (i=0) even when prev_revenue is present', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 5n, revenue: 1000n, prev_revenue: 400n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.momGrowth).toHaveLength(1);
      expect(result.momGrowth[0].growthRate).toBe(0);
    });

    it('returns 0 when prev_revenue is 0 (divide-by-zero guard)', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 1n, revenue: 100n, prev_revenue: 0n },
          { date: '2026-02', redemptions: 2n, revenue: 500n, prev_revenue: 0n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.momGrowth[1].growthRate).toBe(0);
    });

    it('returns 0 when prev_revenue is null (LAG on the earliest row)', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 1n, revenue: 100n, prev_revenue: null },
          { date: '2026-02', redemptions: 2n, revenue: 500n, prev_revenue: null },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.momGrowth[1].growthRate).toBe(0);
    });

    it('computes ((revenue-prev)/prev)*100 for a normal row', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 1n, revenue: 100n, prev_revenue: 50n },
          { date: '2026-02', redemptions: 2n, revenue: 1000n, prev_revenue: 400n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      // ((1000-400)/400)*100 = 150
      expect(result.momGrowth[1].growthRate).toBeCloseTo(150, 6);
    });

    it('keeps fractional precision and reflects negative growth', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 1n, revenue: 100n, prev_revenue: 50n },
          { date: '2026-02', redemptions: 1n, revenue: 1000n, prev_revenue: 3000n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      // ((1000-3000)/3000)*100 = -66.6666...
      expect(result.momGrowth[1].growthRate).toBeCloseTo(-66.6667, 2);
    });

    it('converts bigint redemptions/revenue to plain numbers', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 5n, revenue: 1000n, prev_revenue: null },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.momGrowth[0].redemptions).toBe(5);
      expect(result.momGrowth[0].revenue).toBe(1000);
      expect(typeof result.momGrowth[0].redemptions).toBe('number');
      expect(typeof result.momGrowth[0].revenue).toBe('number');
    });

    it('does not leak prev_revenue into the response shape', async () => {
      stubRaw({
        mom: [
          { date: '2026-01', redemptions: 5n, revenue: 1000n, prev_revenue: 400n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.momGrowth[0]).toEqual({
        date: '2026-01',
        redemptions: 5,
        revenue: 1000,
        growthRate: 0,
      });
    });
  });

  describe('getPlatformGrowthMetrics — yoyComparison growthRate', () => {
    it('computes yearly growthRate and converts year/bigints to numbers', async () => {
      stubRaw({
        yoy: [
          { year: 2025, redemptions: 10n, revenue: 1000n, prev_revenue: null },
          { year: 2026, redemptions: 25n, revenue: 2500n, prev_revenue: 1000n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.yoyComparison[0].growthRate).toBe(0);
      expect(result.yoyComparison[0].year).toBe(2025);
      expect(typeof result.yoyComparison[0].year).toBe('number');
      expect(result.yoyComparison[1]).toEqual({
        year: 2026,
        redemptions: 25,
        revenue: 2500,
        growthRate: 150,
      });
    });

    it('guards yearly divide-by-zero when prev_revenue is 0', async () => {
      stubRaw({
        yoy: [
          { year: 2025, redemptions: 1n, revenue: 100n, prev_revenue: 0n },
          { year: 2026, redemptions: 2n, revenue: 200n, prev_revenue: 0n },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.yoyComparison[1].growthRate).toBe(0);
    });

    it('guards yearly divide-by-zero when prev_revenue is null', async () => {
      stubRaw({
        yoy: [
          { year: 2025, redemptions: 1n, revenue: 100n, prev_revenue: null },
          { year: 2026, redemptions: 2n, revenue: 200n, prev_revenue: null },
        ],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.yoyComparison[1].growthRate).toBe(0);
    });
  });

  describe('getPlatformGrowthMetrics — projections', () => {
    it('produces exactly 30 entries', async () => {
      stubRaw({
        recentRedemptions: [{ count: 20n }],
        recentRevenue: [{ revenue: 5000n }],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.projections).toHaveLength(30);
    });

    it('projects avgDaily * i and dates from endDate + i days', async () => {
      stubRaw({
        recentRedemptions: [{ count: 20n }],
        recentRevenue: [{ revenue: 5000n }],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      // 20 redemptions / 10 days = 2/day
      expect(result.projections[0].projectedRedemptions).toBe(2);
      expect(result.projections[29].projectedRedemptions).toBe(60);
      // 5000 revenue / 10 days = 500/day
      expect(result.projections[0].projectedRevenue).toBe(500);
      expect(result.projections[29].projectedRevenue).toBe(15000);
      // endDate 2026-01-11 + 1 day .. + 30 days
      expect(result.projections[0].date).toBe('2026-01-12');
      expect(result.projections[29].date).toBe('2026-02-10');
    });

    it('rounds projected values to whole numbers', async () => {
      stubRaw({
        recentRedemptions: [{ count: 5n }],
        recentRevenue: [{ revenue: 7n }],
      });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      // 5 / 10 = 0.5/day -> round(0.5 * 1) = 1
      expect(result.projections[0].projectedRedemptions).toBe(1);
      // 7 / 10 = 0.7/day -> round(0.7) = 1
      expect(result.projections[0].projectedRevenue).toBe(1);
      for (const p of result.projections) {
        expect(Number.isInteger(p.projectedRedemptions)).toBe(true);
        expect(Number.isInteger(p.projectedRevenue)).toBe(true);
      }
    });

    it('treats empty recent rows as zero totals', async () => {
      stubRaw({ recentRedemptions: [], recentRevenue: [] });

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.projections[0].projectedRedemptions).toBe(0);
      expect(result.projections[0].projectedRevenue).toBe(0);
    });
  });



  describe('getPlatformGrowthMetrics — milestones', () => {
    it('marks thresholds met by the lifetime redeemed count', async () => {
      mockPrisma.redemptionSession.count.mockResolvedValue(6000);

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.milestones).toEqual([
        { milestone: '1000 Redemptions', achieved: true },
        { milestone: '5000 Redemptions', achieved: true },
        { milestone: '10000 Redemptions', achieved: false },
        { milestone: '50000 Redemptions', achieved: false },
      ]);
    });

    it('marks nothing achieved below the first threshold', async () => {
      mockPrisma.redemptionSession.count.mockResolvedValue(999);

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.milestones.every((m: any) => !m.achieved)).toBe(true);
    });

    it('marks all thresholds achieved at the top tier', async () => {
      mockPrisma.redemptionSession.count.mockResolvedValue(50000);

      const result = await service.getPlatformGrowthMetrics(customDto as any);

      expect(result.milestones.every((m: any) => m.achieved)).toBe(true);
    });

    it('queries the lifetime redeemed count (no date filter)', async () => {
      mockPrisma.redemptionSession.count.mockResolvedValue(0);

      await service.getPlatformGrowthMetrics(customDto as any);

      expect(mockPrisma.redemptionSession.count).toHaveBeenCalledWith({
        where: { status: 'REDEEMED' },
      });
    });
  });

  describe('getPlatformGrowthMetrics — time range handling', () => {
    it('passes the resolved custom start/end dates to every raw query', async () => {
      const seen: unknown[][] = [];
      mockPrisma.$queryRaw.mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          seen.push(values);
          return Promise.resolve([]);
        },
      );
      mockPrisma.redemptionSession.count.mockResolvedValue(0);

      await service.getPlatformGrowthMetrics(customDto as any);

      expect(seen).toHaveLength(4);
      for (const values of seen) {
        expect(values[0]).toEqual(new Date(customDto.startDate));
        expect(values[1]).toEqual(new Date(customDto.endDate));
      }
    });

    it('throws BadRequest when a custom range omits its bounds', async () => {
      await expect(
        service.getPlatformGrowthMetrics({ range: TimeRange.CUSTOM } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws when the custom start is after the custom end', async () => {
      await expect(
        service.getPlatformGrowthMetrics({
          range: TimeRange.CUSTOM,
          startDate: '2026-02-01T00:00:00.000Z',
          endDate: '2026-01-01T00:00:00.000Z',
        } as any),
      ).rejects.toThrow('startDate must be before endDate');
    });
  });
});
