import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AdminOnlyGuard } from '../admin/guards/admin-only.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TimeRangeDto } from './dto/time-range.dto';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('analytics')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('redemption-trends')
  @ApiOperation({ summary: 'Get redemption trends over time' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', 'custom'], required: false, description: 'Time range: 7d, 30d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'granularity', enum: ['daily', 'weekly'], required: false, description: 'Data granularity: daily or weekly' })
  @ApiOkResponse({
    description: 'Chart-ready redemption trends data',
    schema: {
      type: 'object',
      properties: {
        labels: { type: 'array', items: { type: 'string' }, example: ['2026-10-01', '2026-10-02'] },
        datasets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Redemptions' },
              data: { type: 'array', items: { type: 'number' }, example: [10, 15] },
              borderColor: { type: 'string', example: '#6366f1' },
              backgroundColor: { type: 'string', example: '#6366f1' },
            },
          },
        },
      },
    },
  })
  async getRedemptionTrends(@Query() dto: TimeRangeDto) {
    const granularity = dto.granularity || 'daily';
    
    if (granularity === 'weekly') {
      return this.analyticsService.getRedemptionTrendsWeekly(dto);
    }
    
    return this.analyticsService.getRedemptionTrendsDaily(dto);
  }

  @Get('top-offers')
  @ApiOperation({ summary: 'Get leaderboard of most redeemed offers' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', 'custom'], required: false, description: 'Time range: 7d, 30d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Leaderboard of top offers by redemption count',
    schema: {
      type: 'object',
      properties: {
        offers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string', example: 'Buy 1 Get 1 Free Burger' },
              originalPriceNpr: { type: 'number', example: 1300 },
              redemptionCount: { type: 'number', example: 45 },
            },
          },
        },
      },
    },
  })
  async getTopOffers(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getTopOffers(dto);
  }

  @Get('top-merchants')
  @ApiOperation({ summary: 'Get leaderboard of trending merchants' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', 'custom'], required: false, description: 'Time range: 7d, 30d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Leaderboard of trending merchants by total redemptions',
    schema: {
      type: 'object',
      properties: {
        merchants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Burger House' },
              totalRedemptions: { type: 'number', example: 120 },
              uniqueOffersClaimed: { type: 'number', example: 3 },
            },
          },
        },
      },
    },
  })
  async getTrendingMerchants(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getTrendingMerchants(dto);
  }

  @Get('merchant-revenue')
  @ApiOperation({ summary: 'Get merchant revenue analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', 'custom'], required: false, description: 'Time range: 7d, 30d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Leaderboard of merchants by total revenue',
    schema: {
      type: 'object',
      properties: {
        merchants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Burger House' },
              redemptionCount: { type: 'number', example: 120 },
              totalRevenue: { type: 'number', example: 156000 },
            },
          },
        },
      },
    },
  })
  async getMerchantRevenue(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getMerchantRevenue(dto);
  }

  @Get('category-trends')
  @ApiOperation({ summary: 'Get category-wise redemption trends' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', 'custom'], required: false, description: 'Time range: 7d, 30d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Multi-series line chart data for category trends',
    schema: {
      type: 'object',
      properties: {
        labels: { type: 'array', items: { type: 'string' }, example: ['2026-10-01', '2026-10-02'] },
        datasets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Dining' },
              data: { type: 'array', items: { type: 'number' }, example: [10, 15] },
              borderColor: { type: 'string', example: '#6366f1' },
              backgroundColor: { type: 'string', example: '#6366f1' },
            },
          },
        },
      },
    },
  })
  async getCategoryTrends(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getCategoryTrends(dto);
  }

  // Platform-wide analytics endpoints for admin panel
  @Get('platform/revenue')
  @ApiOperation({ summary: 'Get platform-wide revenue analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide revenue analytics including total revenue, by merchant, by category, and growth rates',
  })
  async getPlatformRevenueAnalytics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformRevenueAnalytics(dto);
  }

  @Get('platform/customers')
  @ApiOperation({ summary: 'Get platform-wide customer analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide customer analytics including total users, retention rate, and acquisition trends',
  })
  async getPlatformCustomerAnalytics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformCustomerAnalytics(dto);
  }

  @Get('platform/offers')
  @ApiOperation({ summary: 'Get platform-wide offer performance analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide offer performance analytics including conversion rate, engagement, and top categories',
  })
  async getPlatformOfferPerformanceAnalytics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformOfferPerformanceAnalytics(dto);
  }

  @Get('platform/merchants')
  @ApiOperation({ summary: 'Get platform-wide merchant performance analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide merchant performance analytics including comparison, trends, and activity',
  })
  async getPlatformMerchantPerformanceAnalytics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformMerchantPerformanceAnalytics(dto);
  }

  @Get('platform/time')
  @ApiOperation({ summary: 'Get platform-wide time-based analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide time-based analytics including hourly redemptions and day-of-week performance',
  })
  async getPlatformTimeBasedAnalytics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformTimeBasedAnalytics(dto);
  }

  @Get('platform/growth')
  @ApiOperation({ summary: 'Get platform-wide growth metrics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide growth metrics including MoM growth, YoY comparison, and projections',
  })
  async getPlatformGrowthMetrics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformGrowthMetrics(dto);
  }

  @Get('platform/categories')
  @ApiOperation({ summary: 'Get platform-wide category analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false, description: 'Time range: 7d, 30d, 90d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Platform-wide category analytics including ranking, trends, and cross-category behavior',
  })
  async getPlatformCategoryAnalytics(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getPlatformCategoryAnalytics(dto);
  }
}
