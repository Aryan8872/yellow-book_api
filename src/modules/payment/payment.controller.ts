import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto, VerifyPaymentDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('initiate')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate eSewa or Khalti checkout' })
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentService.initiatePayment(dto, user.id);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify eSewa or Khalti transaction and activate subscription' })
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.paymentService.verifyPayment(dto);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get active public subscription tiers (User/Merchant)' })
  async getPlans(@Query('audience') audience?: string) {
    return this.paymentService.getPublicPlans(audience);
  }

  @Get('reconcile')
  @ApiOperation({ summary: 'Trigger payment reconciliation worker' })
  async reconcile() {
    await this.paymentService.reconcilePendingPayments();
    return { success: true, message: 'Reconciliation run completed' };
  }
}
