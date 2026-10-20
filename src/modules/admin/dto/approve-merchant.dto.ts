import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveMerchantDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  merchantId!: string;

  @ApiPropertyOptional({ description: 'Optional notes for this approval' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional initial subscription plan ID to assign upon approval' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Duration in days for the initial subscription (defaults to plan default or 180)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Whether to mark the initial subscription as a trial', default: false })
  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;
}
