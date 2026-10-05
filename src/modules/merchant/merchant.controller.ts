import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MerchantService } from './merchant.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdatePinDto } from './dto/update-pin.dto';

@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  // Merchant CRUD
  @Post()
  @Roles(UserRole.ADMIN)
  async createMerchant(@Body() dto: CreateMerchantDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.createMerchant(dto, user);
  }

  @Get(':id')
  async getMerchant(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getMerchant(id, user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async updateMerchant(@Param('id') id: string, @Body() dto: UpdateMerchantDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateMerchant(id, dto, user);
  }

  // Branch CRUD
  @Post(':merchantId/branches')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async createBranch(@Param('merchantId') merchantId: string, @Body() dto: CreateBranchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.createBranch(merchantId, dto, user);
  }

  @Get(':merchantId/branches')
  async getBranches(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getBranches(merchantId, user);
  }

  @Put('branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async updateBranch(@Param('branchId') branchId: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateBranch(branchId, dto, user);
  }

  @Delete('branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async deleteBranch(@Param('branchId') branchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.deleteBranch(branchId, user);
  }

  // Staff CRUD
  @Post(':merchantId/staff')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async createStaff(@Param('merchantId') merchantId: string, @Body() dto: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.createStaff(merchantId, dto, user);
  }

  @Get(':merchantId/staff')
  async getStaff(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.getStaff(merchantId, user);
  }

  @Put('staff/:staffId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async updateStaff(@Param('staffId') staffId: string, @Body() dto: UpdateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateStaff(staffId, dto, user);
  }

  @Put(':merchantId/pin')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async updateMerchantPin(@Param('merchantId') merchantId: string, @Body() dto: UpdatePinDto, @CurrentUser() user: AuthenticatedUser) {
    return this.merchantService.updateMerchantPin(merchantId, dto, user);
  }
}
