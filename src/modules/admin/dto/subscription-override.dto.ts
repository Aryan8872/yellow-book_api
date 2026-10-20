import { IsString, IsNotEmpty, IsEnum, IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanAudience } from '@prisma/client';

export enum SubscriptionOverrideMode {
  REPLACE = 'REPLACE', // Sets exact duration from now (resets any existing period)
  EXTEND = 'EXTEND',   // Stacks duration on top of current period end
  RENEW = 'RENEW',     // Starts a fresh cycle of the plan's default duration from now
}

export class UpdateTrialConfigDto {
  @ApiProperty({ enum: PlanAudience })
  @IsEnum(PlanAudience)
  audience: PlanAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultPeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  unlimitedRedeems?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OverrideSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: 'ID of target subscription plan' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({
    enum: SubscriptionOverrideMode,
    description:
      'REPLACE: sets exact duration from now (default). EXTEND: stacks days on current period. RENEW: fresh cycle using plan default duration.',
    default: SubscriptionOverrideMode.REPLACE,
  })
  @IsOptional()
  @IsEnum(SubscriptionOverrideMode)
  mode?: SubscriptionOverrideMode;

  @ApiPropertyOptional({ description: 'Custom duration in days (required for REPLACE/EXTEND, ignored for RENEW unless provided)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  customDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @ApiProperty({ description: 'Audit reason for override', example: 'Launch partner exception 6-month extension' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
