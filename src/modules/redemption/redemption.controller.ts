import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { RedemptionService } from './redemption.service';
import {
  RedeemInitDto,
  MerchantRedeemDto,
  VerifyQrDto,
} from './dto/redemption.dto';
import { Roles, RequireStaffPermission } from '../auth/auth.decorators';
import { UserRole } from '../auth/auth.types';
import { StaffPermissionGuard } from '../auth/guards/staff-permission.guard';
import type { Request } from 'express';
import { ListRedemptionsDto } from '../admin/dto/list-redemptions.dto';

@ApiTags('Redemptions')
@Controller()
export class RedemptionController {
  constructor(
    private readonly redemptionService: RedemptionService,
  ) {}

  @Post('offers/:id/redeem-init')
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Unique client operation UUID to ensure exactly-once initiation',
  })
  @ApiOperation({
    summary:
      'Consumer initiates redemption: Generates 180s on-screen code + QR',
  })
  @ApiResponse({ status: 200, description: 'Redemption session initiated' })
  @ApiResponse({ status: 403, description: 'Active subscription required' })
  async initRedeem(
    @Param('id') id: string,
    @Body() dto: RedeemInitDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.redemptionService.initRedemption(id, user, dto);
  }

  @Post('merchant/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.MERCHANT_STAFF, UserRole.MERCHANT_ADMIN, UserRole.ADMIN)
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Unique cashier transaction UUID preventing duplicate submission',
  })
  @ApiOperation({
    summary:
      'Merchant cashier verifies customer code + merchant PIN to complete redemption',
  })
  @ApiResponse({ status: 200, description: 'Voucher redeemed successfully' })
  @ApiResponse({ status: 401, description: 'Incorrect merchant PIN' })
  @ApiResponse({
    status: 409,
    description: 'Voucher already used or concurrently locked',
  })
  async merchantRedeem(@Body() dto: MerchantRedeemDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.redemptionService.merchantRedeem(user, dto);
  }

  @Post('redemption/merchant/verify-qr')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.MERCHANT_STAFF, UserRole.MERCHANT_ADMIN, UserRole.ADMIN)
  @RequireStaffPermission('redeem')
  @UseGuards(StaffPermissionGuard)
  @ApiOperation({
    summary:
      'Staff scans the customer QR to complete redemption (staff-permission based, no merchant PIN). Documented fallback remains POST /merchant/redeem.',
  })
  @ApiResponse({ status: 200, description: 'Voucher redeemed successfully' })
  @ApiResponse({ status: 403, description: 'Not an active staff member / missing redeem permission / wrong merchant' })
  @ApiResponse({
    status: 409,
    description: 'Voucher already used or concurrently locked',
  })
  async verifyQr(@Body() dto: VerifyQrDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.redemptionService.verifyQrRedemption(user, dto);
  }

  @Get('redemption/qr-image')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Render a redemption QR payload string into a scannable PNG data URL',
  })
  @ApiResponse({ status: 200, description: 'PNG data URL for the payload' })
  @ApiResponse({ status: 400, description: 'payload query parameter missing' })
  async getQrImage(@Query('payload') payload: string) {
    return this.redemptionService.renderQrImage(payload);
  }

  @Get('redemptions/me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user redemption history and active vouchers' })
  @ApiResponse({ status: 200, description: 'List of redemption sessions for current user' })
  async getMyRedemptions(@Req() req: Request) {
    const user = (req as any).user;
    return this.redemptionService.getMyRedemptions(user.id);
  }

  @Get('sessions')
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List redemption sessions with pagination, search, and filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of redemption sessions' })
  async listRedemptions(@Query() dto: ListRedemptionsDto) {
    return this.redemptionService.listRedemptions(dto);
  }

  @Post('redemption/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.MERCHANT_STAFF, UserRole.MERCHANT_ADMIN, UserRole.ADMIN, UserRole.CONSUMER)
  @ApiOperation({
    summary: 'Cancel an active redemption session (staff-permission based or user self-cancel)',
  })
  @ApiResponse({ status: 200, description: 'Redemption session cancelled' })
  @ApiResponse({ status: 403, description: 'Not authorized to cancel this redemption' })
  @ApiResponse({ status: 404, description: 'Redemption session not found' })
  @ApiResponse({ status: 400, description: 'Cannot cancel - session already completed or expired' })
  async cancelRedemption(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.redemptionService.cancelRedemption(id, user);
  }
}
