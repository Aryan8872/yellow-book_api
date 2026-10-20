import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
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
import { MerchantBranchService } from '../services/merchant-branch.service';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { ListBranchesDto } from '../../admin/dto/list-branches.dto';

@ApiTags('Merchants - Branches')
@ApiBearerAuth('JWT-auth')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantBranchController {
  constructor(private readonly branchService: MerchantBranchService) {}

  @Get('branches/all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all branches with pagination, search, and filters (Admin only)' })
  @ApiOkResponse({ description: 'Paginated list of branches' })
  async listAllBranches(@Query() dto: ListBranchesDto) {
    return this.branchService.listAllBranches(dto);
  }

  @Post(':merchantId/branches')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Create a new branch for a merchant' })
  @ApiBody({ type: CreateBranchDto })
  @ApiResponse({ status: 201, description: 'Branch created successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to create branch for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createBranch(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchService.createBranch(merchantId, dto, user);
  }

  @Get(':merchantId/branches')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get all branches for a merchant' })
  @ApiOkResponse({ description: 'Paginated list of branches for the merchant' })
  @ApiResponse({ status: 403, description: 'Not authorized to view branches for this merchant' })
  async getBranches(
    @Param('merchantId') merchantId: string,
    @Query() dto: ListBranchesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchService.getBranches(merchantId, dto, user);
  }

  @Put(':merchantId/branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update branch details' })
  @ApiBody({ type: UpdateBranchDto })
  @ApiResponse({ status: 200, description: 'Branch updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this branch' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async updateBranch(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchService.updateBranch(branchId, merchantId, dto, user);
  }

  @Delete(':merchantId/branches/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Delete a branch' })
  @ApiResponse({ status: 204, description: 'Branch deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this branch' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async deleteBranch(
    @Param('merchantId') merchantId: string,
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchService.deleteBranch(branchId, merchantId, user);
  }
}
