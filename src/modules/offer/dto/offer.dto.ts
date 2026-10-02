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

export class QueryOffersDto {
  @ApiPropertyOptional({ example: 'burger' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    example: 'DINING',
    enum: ['DINING', 'WELLNESS', 'ENTERTAINMENT', 'RETAIL', 'TRAVEL', 'BEAUTY'],
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 27.7172 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: 85.324 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ example: 10, description: 'Radius in kilometers' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  radiusKm?: number;

  @ApiPropertyOptional({ example: 1, description: 'Page number (1-indexed)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20, description: 'Results per page (max 100)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export class CreateOfferDto {
  @ApiProperty({ example: '50% Off on All Burgers' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    example: 'Get 50% discount on all burger items. Valid for dine-in only.',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({
    example: 'Cannot be combined with other offers. Valid for dine-in only.',
  })
  @IsString()
  @IsNotEmpty()
  terms!: string;

  @ApiProperty({
    example: 'DINING',
    enum: ['DINING', 'WELLNESS', 'ENTERTAINMENT', 'RETAIL', 'TRAVEL', 'BEAUTY'],
  })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ example: 500, description: 'Estimated savings in NPR' })
  @IsNumber()
  @Min(0)
  estimatedSavingsNpr!: number;

  @ApiProperty({
    example: 3,
    description: 'Maximum number of times a user can redeem this offer',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  maxPerUser!: number;

  @ApiProperty({
    example: true,
    description: 'Whether the offer is currently active',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether to feature this offer prominently',
  })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    example: { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], hours: { start: '10:00', end: '22:00' } },
    description: 'JSON object for availability restrictions',
  })
  @IsObject()
  @IsOptional()
  availabilityJson?: Record<string, any>;

  @ApiPropertyOptional({
    example: '2024-01-01T00:00:00Z',
    description: 'Offer valid from date',
  })
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59Z',
    description: 'Offer valid until date',
  })
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}

export class UpdateOfferDto {
  @ApiPropertyOptional({ example: '50% Off on All Burgers' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    example: 'Get 50% discount on all burger items. Valid for dine-in only.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'Cannot be combined with other offers. Valid for dine-in only.',
  })
  @IsString()
  @IsOptional()
  terms?: string;

  @ApiPropertyOptional({
    example: 'DINING',
    enum: ['DINING', 'WELLNESS', 'ENTERTAINMENT', 'RETAIL', 'TRAVEL', 'BEAUTY'],
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 500, description: 'Estimated savings in NPR' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedSavingsNpr?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Maximum number of times a user can redeem this offer',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxPerUser?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the offer is currently active',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether to feature this offer prominently',
  })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    example: { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], hours: { start: '10:00', end: '22:00' } },
    description: 'JSON object for availability restrictions',
  })
  @IsObject()
  @IsOptional()
  availabilityJson?: Record<string, any>;

  @ApiPropertyOptional({
    example: '2024-01-01T00:00:00Z',
    description: 'Offer valid from date',
  })
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59Z',
    description: 'Offer valid until date',
  })
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}
