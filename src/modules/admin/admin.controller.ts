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
import { ReactivateMerchantDto } from './dto/reactivate-merchant.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { CreateUserDto } from './dto/create-user.dto';
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

  @Get('metrics/live')
  @ApiOperation({ summary: 'Get live active sessions and active subscribers breakdown' })
  async getLiveMetrics() {
    return this.adminService.getLiveSystemMetrics();
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

  @Post('merchants')
  @ApiOperation({ summary: 'Create a new merchant directly from admin' })
  @ApiResponse({ status: 201, description: 'Merchant created successfully' })
  async createMerchant(
    @Body() dto: CreateMerchantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.createMerchant(dto, admin.id);
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

  @Post('merchants/reactivate')
  @ApiOperation({ summary: 'Reactivate a suspended or archived merchant account' })
  @ApiResponse({ status: 200, description: 'Merchant reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async reactivateMerchant(
    @Body() dto: ReactivateMerchantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.reactivateMerchant(dto, admin.id);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a new user directly from admin' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  async createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.createUser(dto, admin.id);
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

  @Get('audit-logs')
  @ApiOperation({ summary: 'List system audit logs with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of system audit logs' })
  async listAuditLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAuditLogs({ page, limit, entity, action, search });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLANS & MONETIZATION
  // ─────────────────────────────────────────────────────────────────────────

  @Post('plans')
  @ApiOperation({ summary: 'Create a new subscription plan/tier' })
  async createPlan(
    @Body() dto: any,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.createPlan(dto, admin.id);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans' })
  async listPlans(
    @Query('audience') audience?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.adminService.listPlans({
      audience,
      includeArchived: includeArchived === 'true',
    });
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update an existing subscription plan' })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updatePlan(id, dto, admin.id);
  }

  @Delete('plans/:id')
  @ApiOperation({ summary: 'Soft delete / archive a subscription plan' })
  async deletePlan(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.deletePlan(id, admin.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIAL CONFIGURATION & OVERRIDES
  // ─────────────────────────────────────────────────────────────────────────

  @Get('trials/config')
  @ApiOperation({ summary: 'Get global trial configurations' })
  async getTrialConfigs() {
    return this.adminService.getTrialConfigs();
  }

  @Patch('trials/config')
  @ApiOperation({ summary: 'Update global trial settings' })
  async updateTrialConfig(
    @Body() dto: any,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateTrialConfig(dto, admin.id);
  }

  @Post('subscriptions/override')
  @ApiOperation({ summary: 'Manually grant, extend, or override a user/merchant subscription' })
  async overrideSubscription(
    @Body() dto: any,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.overrideSubscription(dto, admin.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENTS & TRANSACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  @Get('payments')
  @ApiOperation({ summary: 'List all payment transactions with filters' })
  async listPayments(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('gateway') gateway?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listPayments({ page, limit, gateway, status, search });
  }

  @Post('payments/:id/verify-manual')
  @ApiOperation({ summary: 'Manually verify and resolve a payment transaction (Admin only)' })
  async verifyManualPayment(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.verifyManualPayment(id, admin.id, notes);
  }

  @Get('merchants/:id/billing')
  @ApiOperation({ summary: 'Get detailed billing, quotas and subscription status of a merchant' })
  async getMerchantBilling(@Param('id') id: string) {
    return this.adminService.getMerchantBilling(id);
  }

  @Post('push/broadcast')
  @ApiOperation({ summary: 'Send push notification broadcast to all subscribed users (Admin only)' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { sent: { type: 'boolean' }, messageId: { type: 'string', nullable: true } } } })
  async broadcastPush(
    @Body('title') title: string,
    @Body('body') body: string,
    @Body('data') data?: Record<string, string>,
  ) {
    return this.adminService.broadcastPush({ title, body, data });
  }
}

