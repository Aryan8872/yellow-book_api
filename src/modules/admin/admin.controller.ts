import { Controller, Get, Post, Query, Body, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminOnlyGuard } from './guards/admin-only.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { ApproveMerchantDto } from './dto/approve-merchant.dto';
import { RejectMerchantDto } from './dto/reject-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { SuspendMerchantDto } from './dto/suspend-merchant.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ActivateUserDto } from './dto/activate-user.dto';
import { ListFraudFlagsDto } from './dto/list-fraud-flags.dto';
import { ReviewFraudDto } from './dto/review-fraud.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiOkResponse({
    description: 'Dashboard stats including merchants, users, and offers counts',
    schema: {
      type: 'object',
      properties: {
        totalMerchants: { type: 'number', example: 5 },
        pendingMerchants: { type: 'number', example: 0 },
        totalUsers: { type: 'number', example: 7 },
        activeOffers: { type: 'number', example: 7 },
      },
    },
  })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('merchants')
  @ApiOperation({ summary: 'List all merchants with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of merchants' })
  async listMerchants(@Query() dto: ListMerchantsDto) {
    return this.adminService.listMerchants(dto);
  }

  @Post('merchants/approve')
  @ApiOperation({ summary: 'Approve a pending merchant application' })
  @ApiResponse({ status: 200, description: 'Merchant approved successfully' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async approveMerchant(
    @Body() dto: ApproveMerchantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.approveMerchant(dto, admin.id);
  }

  @Post('merchants/reject')
  @ApiOperation({ summary: 'Reject a pending merchant application' })
  @ApiResponse({ status: 200, description: 'Merchant rejected successfully' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async rejectMerchant(
    @Body() dto: RejectMerchantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.rejectMerchant(dto, admin.id);
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: 'Get detailed information about a specific merchant' })
  @ApiOkResponse({ description: 'Merchant details with branches and offers' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantDetails(@Param('id') id: string) {
    return this.adminService.getMerchantDetails(id);
  }

  @Patch('merchants/:id')
  @ApiOperation({ summary: 'Update merchant information' })
  @ApiResponse({ status: 200, description: 'Merchant updated successfully' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateMerchant(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateMerchant(id, dto, admin.id);
  }

  @Post('merchants/suspend')
  @ApiOperation({ summary: 'Suspend a merchant account' })
  @ApiResponse({ status: 200, description: 'Merchant suspended successfully' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async suspendMerchant(
    @Body() dto: SuspendMerchantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.suspendMerchant(dto, admin.id);
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of users' })
  async listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get detailed information about a specific user' })
  @ApiOkResponse({ description: 'User details with subscription and activity info' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user information' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateUser(id, dto, admin.id);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user account' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.deleteUser(id, admin.id);
  }

  @Post('users/suspend')
  @ApiOperation({ summary: 'Suspend a user account' })
  @ApiResponse({ status: 200, description: 'User suspended successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspendUser(
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.suspendUser(dto, admin.id);
  }

  @Post('users/activate')
  @ApiOperation({ summary: 'Activate a suspended user account' })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async activateUser(
    @Body() dto: ActivateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.activateUser(dto, admin.id);
  }

  @Get('fraud-flags')
  @ApiOperation({ summary: 'List fraud flags with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of fraud flags' })
  async listFraudFlags(@Query() dto: ListFraudFlagsDto) {
    return this.adminService.listFraudFlags(dto);
  }

  @Get('fraud-flags/:id')
  @ApiOperation({ summary: 'Get detailed information about a specific fraud flag' })
  @ApiOkResponse({ description: 'Fraud flag details with redemption context' })
  @ApiResponse({ status: 404, description: 'Fraud flag not found' })
  async getFraudFlagDetails(@Param('id') id: string) {
    return this.adminService.getFraudFlagDetails(id);
  }

  @Post('fraud-flags/review')
  @ApiOperation({ summary: 'Review and resolve a fraud flag' })
  @ApiResponse({ status: 200, description: 'Fraud flag reviewed successfully' })
  @ApiResponse({ status: 404, description: 'Fraud flag not found' })
  async reviewFraudFlag(
    @Body() dto: ReviewFraudDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.reviewFraudFlag(dto, admin.id);
  }
}
