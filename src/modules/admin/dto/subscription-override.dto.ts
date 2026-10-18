import { IsString, IsNotEmpty, IsEnum, IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanAudience } from '@prisma/client';

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

  @ApiPropertyOptional({ description: 'Custom duration in days from now (e.g. 60 for 2 months)' })
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
