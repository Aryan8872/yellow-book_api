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
}
