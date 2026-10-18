import { IsString, IsNotEmpty, IsEnum, IsNumber, Min, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanAudience, BillingCycle } from '@prisma/client';

export class CreateSubscriptionPlanDto {
  @ApiProperty({ description: 'Unique code for plan', example: 'MERCHANT_GROWTH' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Display name', example: 'Growth (Standard)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Description', example: 'Ideal for multi-location merchants' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PlanAudience, description: 'Audience scope: MERCHANT or USER', example: PlanAudience.MERCHANT })
  @IsEnum(PlanAudience)
  audience: PlanAudience;

  @ApiProperty({ description: 'Price in NPR', example: 4999 })
  @IsNumber()
  @Min(0)
  priceNpr: number;

  @ApiPropertyOptional({ enum: BillingCycle, default: BillingCycle.MONTHLY })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ description: 'Duration in days', default: 30, example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Free trial days', default: 0, example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({
    description: 'Entitlement quotas and feature flags JSON',
    example: {
      maxBranches: 5,
      maxActiveOffers: 15,
      featuredBoostCount: 2,
      staffPinCount: 5,
      analyticsTier: 'ADVANCED',
    },
  })
  @IsObject()
  entitlements: Record<string, any>;
}

export class UpdateSubscriptionPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceNpr?: number;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  entitlements?: Record<string, any>;
}
