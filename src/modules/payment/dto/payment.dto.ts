import { IsString, IsNotEmpty, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentGateway } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({ description: 'ID of subscription plan to purchase' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({ enum: PaymentGateway, description: 'Payment gateway', example: PaymentGateway.KHALTI })
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @ApiPropertyOptional({ description: 'Merchant ID if purchasing merchant tier' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Success return URL' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ enum: PaymentGateway })
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @ApiProperty({ description: 'Internal order ID generated during initiation' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiPropertyOptional({ description: 'Token/Pidx from Khalti or transaction code from eSewa' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'eSewa transaction code/ref ID' })
  @IsOptional()
  @IsString()
  refId?: string;
}
