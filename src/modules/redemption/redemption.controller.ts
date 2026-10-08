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
} from './dto/redemption.dto';
import { Roles } from '../auth/auth.decorators';
import { UserRole } from '../auth/auth.types';
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

  @Get('sessions')
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List redemption sessions with pagination, search, and filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of redemption sessions' })
  async listRedemptions(@Query() dto: ListRedemptionsDto) {
    return this.redemptionService.listRedemptions(dto);
  }
}
