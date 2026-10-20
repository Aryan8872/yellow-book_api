import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBody,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { UserRole } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/auth.decorators';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MerchantOwnershipGuard } from '../guards/merchant-ownership.guard';
import { MerchantService } from '../merchant.service';
import { CreateMerchantDto } from '../dto/create-merchant.dto';
import { UpdateMerchantDto } from '../dto/update-merchant.dto';
import { ListMerchantsDto } from '../../admin/dto/list-merchants.dto';
import { ListMerchantRedemptionsDto } from '../dto/list-merchant-redemptions.dto';
import { ListMerchantOffersDto } from '../dto/list-merchant-offers.dto';

@ApiTags('Merchants - Profiles & Operations')
@ApiBearerAuth('JWT-auth')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantProfileController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all merchants with pagination, search, and filters (Admin only)' })
  @ApiOkResponse({ description: 'Paginated list of merchants' })
  async listAllMerchants(@Query() dto: ListMerchantsDto) {
    return this.merchantService.listAllMerchants(dto);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new merchant (Admin only)' })
  @ApiBody({ type: CreateMerchantDto })
  @ApiResponse({ status: 201, description: 'Merchant created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async createMerchant(@Body() dto: CreateMerchantDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.createMerchant(dto, user);
  }

  @Get(':id')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant details by ID' })
  @ApiOkResponse({ description: 'Merchant details with branches and staff' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchant(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getMerchant(id, user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update merchant details' })
  @ApiBody({ type: UpdateMerchantDto })
  @ApiResponse({ status: 200, description: 'Merchant updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateMerchant(@Param('id') id: string, @Body() dto: UpdateMerchantDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateMerchant(id, dto, user);
  }

  @Get(':merchantId/dashboard')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant dashboard statistics' })
  @ApiOkResponse({
    description: 'Dashboard stats including offers, redemptions, branches counts',
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant dashboard' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantDashboard(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getMerchantDashboard(merchantId, user);
  }

  @Get(':merchantId/redemptions')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant redemptions with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of redemptions for the merchant' })
  @ApiResponse({ status: 403, description: 'Not authorized to view redemptions for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantRedemptions(
    @Param('merchantId') merchantId: string,
    @Query() dto: ListMerchantRedemptionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.merchantService.getMerchantRedemptions(merchantId, dto, user);
  }

  @Get(':merchantId/offers')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get all offers for a merchant with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of offers for the merchant' })
  @ApiResponse({ status: 403, description: 'Not authorized to view offers for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantOffers(
    @Param('merchantId') merchantId: string,
    @Query() dto: ListMerchantOffersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.merchantService.getMerchantOffers(merchantId, dto, user);
  }

  @Get(':id/billing')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant self-serve billing, active plan, and quotas' })
  @ApiOkResponse({ description: 'Billing summary, subscription status, and resource quotas' })
  @ApiResponse({ status: 403, description: 'Not authorized to view billing' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantBilling(@Param('id') id: string) {
    return this.merchantService.getMerchantBilling(id);
  }
}

