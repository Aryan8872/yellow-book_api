import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/auth.decorators';
import { MerchantService } from './merchant.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import type { Request } from 'express';

@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  private getUser(req: Request): AuthenticatedUser {
    return (req as any).user as AuthenticatedUser;
  }

  // Merchant CRUD
  @Post()
  @Roles(UserRole.ADMIN)
  async createMerchant(@Body() dto: CreateMerchantDto, @Req() req: Request) {
    return this.merchantService.createMerchant(dto, this.getUser(req));
  }

  @Get(':id')
  async getMerchant(@Param('id') id: string, @Req() req: Request) {
    return this.merchantService.getMerchant(id, this.getUser(req));
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async updateMerchant(@Param('id') id: string, @Body() dto: UpdateMerchantDto, @Req() req: Request) {
    return this.merchantService.updateMerchant(id, dto, this.getUser(req));
  }

  // Branch CRUD
  @Post(':merchantId/branches')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async createBranch(@Param('merchantId') merchantId: string, @Body() dto: CreateBranchDto, @Req() req: Request) {
    return this.merchantService.createBranch(merchantId, dto, this.getUser(req));
  }

  @Get(':merchantId/branches')
  async getBranches(@Param('merchantId') merchantId: string, @Req() req: Request) {
    return this.merchantService.getBranches(merchantId, this.getUser(req));
  }

  @Put('branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async updateBranch(@Param('branchId') branchId: string, @Body() dto: UpdateBranchDto, @Req() req: Request) {
    return this.merchantService.updateBranch(branchId, dto, this.getUser(req));
  }

  @Delete('branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  async deleteBranch(@Param('branchId') branchId: string, @Req() req: Request) {
    return this.merchantService.deleteBranch(branchId, this.getUser(req));
  }
}
