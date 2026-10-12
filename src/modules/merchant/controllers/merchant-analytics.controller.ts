import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MerchantOwnershipGuard } from '../guards/merchant-ownership.guard';
import { MerchantAnalyticsService } from '../services/merchant-analytics.service';
import { TimeRangeDto } from '../../analytics/dto/time-range.dto';

@ApiTags('Merchants - Analytics & Business Intelligence')
@ApiBearerAuth('JWT-auth')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantAnalyticsController {
  constructor(private readonly analyticsService: MerchantAnalyticsService) {}

  @Get(':merchantId/analytics')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant analytics data (overview)' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Analytics data including redemption trends and offer performance' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantAnalytics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/revenue')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant revenue analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Revenue analytics including total revenue, by offer, by branch, and growth rates' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantRevenueAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantRevenueAnalytics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/customers')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant customer analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Customer analytics including new/returning customers and retention rate' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantCustomerAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantCustomerAnalytics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/offers')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant offer performance analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Offer performance analytics including conversion rate and engagement' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantOfferPerformanceAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantOfferPerformanceAnalytics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/branches')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant branch performance analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Branch performance analytics including comparison and staff efficiency' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantBranchPerformanceAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantBranchPerformanceAnalytics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/time')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant time-based analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Time-based analytics including hourly redemptions and day-of-week performance' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantTimeBasedAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantTimeBasedAnalytics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/growth')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant growth metrics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Growth metrics including MoM growth, YoY comparison, and projections' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantGrowthMetrics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantGrowthMetrics(merchantId, dto, user);
  }

  @Get(':merchantId/analytics/categories')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant category analytics' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', '90d', 'custom'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiOkResponse({ description: 'Category analytics including ranking, trends, and cross-category behavior' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantCategoryAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analyticsService.getMerchantCategoryAnalytics(merchantId, dto, user);
  }
}
