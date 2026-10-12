import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
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
import { MerchantStaffService } from '../services/merchant-staff.service';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { UpdatePinDto } from '../dto/update-pin.dto';

@ApiTags('Merchants - Staff & Security')
@ApiBearerAuth('JWT-auth')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantStaffController {
  constructor(private readonly staffService: MerchantStaffService) {}

  @Post(':merchantId/staff')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Create a new staff member for a merchant' })
  @ApiBody({ type: CreateStaffDto })
  @ApiResponse({ status: 201, description: 'Staff created successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to create staff for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createStaff(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffService.createStaff(merchantId, dto, user);
  }

  @Get(':merchantId/staff')
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Get all staff members for a merchant' })
  @ApiOkResponse({ description: 'List of staff members for the merchant' })
  @ApiResponse({ status: 403, description: 'Not authorized to view staff for this merchant' })
  async getStaff(@Param('merchantId') merchantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffService.getStaff(merchantId, user);
  }

  @Put(':merchantId/staff/:staffId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update staff member details' })
  @ApiBody({ type: UpdateStaffDto })
  @ApiResponse({ status: 200, description: 'Staff updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this staff member' })
  @ApiResponse({ status: 404, description: 'Staff not found' })
  async updateStaff(
    @Param('merchantId') merchantId: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffService.updateStaff(staffId, merchantId, dto, user);
  }

  @Put(':merchantId/pin')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update merchant PIN for redemption verification' })
  @ApiBody({ type: UpdatePinDto })
  @ApiResponse({ status: 200, description: 'PIN updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update PIN for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateMerchantPin(
    @Param('merchantId') merchantId: string,
    @Body() dto: UpdatePinDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffService.updateMerchantPin(merchantId, dto, user);
  }
}
