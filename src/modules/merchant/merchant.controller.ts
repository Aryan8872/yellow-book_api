import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBody,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MerchantOwnershipGuard } from './guards/merchant-ownership.guard';
import { MerchantService } from './merchant.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { ListMerchantsDto } from '../admin/dto/list-merchants.dto';
import { ListBranchesDto } from '../admin/dto/list-branches.dto';
import { ListMerchantRedemptionsDto } from './dto/list-merchant-redemptions.dto';
import { TimeRangeDto } from '../analytics/dto/time-range.dto';
import { OfferService } from '../offer/offer.service';
import { CreateOfferDto } from '../offer/dto/offer.dto';
import { UpdateOfferDto } from '../offer/dto/offer.dto';
import { UploadService } from '../upload/upload.service';

@ApiTags('Merchants')
@ApiBearerAuth('JWT-auth')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly offerService: OfferService,
    private readonly uploadService: UploadService,
  ) {}

  // Merchant CRUD
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

  @Get('branches/all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all branches with pagination, search, and filters (Admin only)' })
  @ApiOkResponse({ description: 'Paginated list of branches' })
  async listAllBranches(@Query() dto: ListBranchesDto) {
    return this.merchantService.listAllBranches(dto);
  }

  // Branch CRUD
  @Post(':merchantId/branches')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Create a new branch for a merchant' })
  @ApiBody({ type: CreateBranchDto })
  @ApiResponse({ status: 201, description: 'Branch created successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to create branch for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createBranch(@Param('merchantId') merchantId: string, @Body() dto: CreateBranchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.createBranch(merchantId, dto, user);
  }

  @Get(':merchantId/branches')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get all branches for a merchant' })
  @ApiOkResponse({ description: 'List of branches for the merchant' })
  @ApiResponse({ status: 403, description: 'Not authorized to view branches for this merchant' })
  async getBranches(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getBranches(merchantId, user);
  }

  @Put(':merchantId/branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update branch details' })
  @ApiBody({ type: UpdateBranchDto })
  @ApiResponse({ status: 200, description: 'Branch updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this branch' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async updateBranch(@Param('merchantId') merchantId: string, @Param('branchId') branchId: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateBranch(branchId, merchantId, dto, user);
  }

  @Delete(':merchantId/branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Delete a branch' })
  @ApiResponse({ status: 204, description: 'Branch deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this branch' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async deleteBranch(@Param('merchantId') merchantId: string, @Param('branchId') branchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.deleteBranch(branchId, merchantId, user);
  }

  // Staff CRUD
  @Post(':merchantId/staff')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Create a new staff member for a merchant' })
  @ApiBody({ type: CreateStaffDto })
  @ApiResponse({ status: 201, description: 'Staff created successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to create staff for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createStaff(@Param('merchantId') merchantId: string, @Body() dto: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.createStaff(merchantId, dto, user);
  }

  @Get(':merchantId/staff')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get all staff members for a merchant' })
  @ApiOkResponse({ description: 'List of staff members for the merchant' })
  @ApiResponse({ status: 403, description: 'Not authorized to view staff for this merchant' })
  async getStaff(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getStaff(merchantId, user);
  }

  @Put(':merchantId/staff/:staffId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update staff member details' })
  @ApiBody({ type: UpdateStaffDto })
  @ApiResponse({ status: 200, description: 'Staff updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this staff member' })
  @ApiResponse({ status: 404, description: 'Staff not found' })
  async updateStaff(@Param('merchantId') merchantId: string, @Param('staffId') staffId: string, @Body() dto: UpdateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateStaff(staffId, merchantId, dto, user);
  }

  @Put(':merchantId/pin')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update merchant PIN for redemption verification' })
  @ApiBody({ type: UpdatePinDto })
  @ApiResponse({ status: 200, description: 'PIN updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update PIN for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateMerchantPin(@Param('merchantId') merchantId: string, @Body() dto: UpdatePinDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateMerchantPin(merchantId, dto, user);
  }

  // Merchant Dashboard & Analytics
  @Get(':merchantId/dashboard')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant dashboard statistics' })
  @ApiOkResponse({
    description: 'Dashboard stats including offers, redemptions, branches counts',
    schema: {
      type: 'object',
      properties: {
        totalOffers: { type: 'number', example: 10 },
        activeOffers: { type: 'number', example: 8 },
        totalRedemptions: { type: 'number', example: 150 },
        totalBranches: { type: 'number', example: 3 },
        totalStaff: { type: 'number', example: 5 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant dashboard' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantDashboard(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getMerchantDashboard(merchantId, user);
  }

  @Get(':merchantId/analytics')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get merchant analytics data' })
  @ApiQuery({ name: 'range', enum: ['7d', '30d', 'custom'], required: false, description: 'Time range: 7d, 30d, or custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601) when range=custom' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601) when range=custom' })
  @ApiOkResponse({
    description: 'Analytics data including redemption trends and offer performance',
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant analytics' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantAnalytics(
    @Param('merchantId') merchantId: string,
    @Query() dto: TimeRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.merchantService.getMerchantAnalytics(merchantId, dto, user);
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
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by title' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by category' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'isFeatured', required: false, type: Boolean, description: 'Filter by featured status' })
  @ApiOkResponse({
    description: 'Paginated list of offers for the merchant',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view offers for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantOffers(
    @Param('merchantId') merchantId: string,
    @Query() query: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.merchantService.getMerchantOffers(merchantId, query, user);
  }

  // Offer CRUD (merchant-scoped)
  @Post(':merchantId/offers')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Create a new offer for a merchant' })
  @ApiBody({ type: CreateOfferDto })
  @ApiResponse({ status: 201, description: 'Offer created successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to create offer for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createOffer(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offerService.createOffer(merchantId, dto);
  }

  @Patch(':merchantId/offers/:offerId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update an offer' })
  @ApiBody({ type: UpdateOfferDto })
  @ApiResponse({ status: 200, description: 'Offer updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async updateOffer(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offerService.updateOffer(offerId, merchantId, dto);
  }

  @Delete(':merchantId/offers/:offerId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Delete an offer' })
  @ApiResponse({ status: 200, description: 'Offer deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async deleteOffer(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offerService.deleteOffer(offerId, merchantId);
  }

  @Post(':merchantId/offers/:offerId/upload-cover')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload cover image for an offer' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to upload image for this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async uploadOfferCoverImage(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const uploadResult = await this.uploadService.uploadFile(file, 'offers/cover');
    await this.offerService.updateOffer(offerId, merchantId, { coverImage: uploadResult.url });
    return { url: uploadResult.url, publicId: uploadResult.publicId };
  }

  @Post(':merchantId/offers/:offerId/upload-images')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload additional images for an offer gallery' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to upload image for this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async uploadOfferGalleryImage(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const uploadResult = await this.uploadService.uploadFile(file, 'offers/gallery');
    const offer = await this.offerService.getOfferById(offerId);
    const images = offer.images || [];
    images.push(uploadResult.url);
    await this.offerService.updateOffer(offerId, merchantId, { images });
    return { url: uploadResult.url, publicId: uploadResult.publicId, images };
  }
}
