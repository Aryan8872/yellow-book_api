import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsDateString,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RedeemInitDto {
  @ApiPropertyOptional({
    example: 27.7172,
    description: 'User current GPS latitude for fraud detection',
  })
  @IsNumber()
  @IsOptional()
  userLat?: number;

  @ApiPropertyOptional({
    example: 85.324,
    description: 'User current GPS longitude for fraud detection',
  })
  @IsNumber()
  @IsOptional()
  userLng?: number;

  @ApiPropertyOptional({
    example: 'iPhone 15 Pro Max',
    description: 'Device fingerprint metadata',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class MerchantRedeemDto {
  @ApiProperty({
    example: 'NF-7821',
    description: '6-character redemption session token from customer',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    example: '1234',
    description: '4-digit merchant verification PIN',
  })
  @IsString()
  @IsNotEmpty()
  merchantPin!: string;

  @ApiPropertyOptional({
    example: 'stf_001',
    description: 'ID of the merchant cashier/waiter (optional)',
  })
  @IsString()
  @IsOptional()
  staffId?: string;
}
