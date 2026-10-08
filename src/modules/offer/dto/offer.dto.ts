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
  IsArray,
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

    @ApiPropertyOptional({
      example: 'trending',
      enum: ['trending', 'popular', 'rating', 'savings', 'newest'],
      description: 'Sort offers by criteria',
    })
    @IsString()
    @IsOptional()
    sortBy?: 'trending' | 'popular' | 'rating' | 'savings' | 'newest';

    @ApiPropertyOptional({ example: 'Kathmandu', description: 'Filter by city or district name' })
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional({ example: 'Thamel', description: 'Filter by area/neighborhood name or location text' })
    @IsString()
    @IsOptional()
    location?: string;

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

    @ApiPropertyOptional({ example: 'clx456def', description: 'Filter offers by merchant ID' })
    @IsString()
    @IsOptional()
    merchantId?: string;

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

  @ApiProperty({ example: 'cmusspcto0003devrmc2l7q84', description: 'Category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ example: 500, description: 'Estimated savings in NPR' })
  @IsNumber()
  @Min(0)
  estimatedSavingsNpr!: number;

  @ApiPropertyOptional({ example: 1200, description: 'Original price in NPR before discount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  originalPriceNpr?: number;

  @ApiPropertyOptional({ example: 50, description: 'Discount percentage 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @ApiPropertyOptional({
    example: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
    description: 'Primary hero cover image URL shown on cards',
  })
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({
    example: [
      'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    ],
    description: 'Image gallery URLs — used in the offer detail image slider',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({
    example: ["Chef's Signature Burger", 'Secret Sauce', 'Crispy Artisan Fries'],
    description: 'Highlight label strings shown as story bubbles on the detail page',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  highlights?: string[];

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

  @ApiPropertyOptional({ example: 'cmusspcto0003devrmc2l7q84', description: 'Category ID' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 500, description: 'Estimated savings in NPR' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedSavingsNpr?: number;

  @ApiPropertyOptional({ example: 1200, description: 'Original price in NPR before discount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  originalPriceNpr?: number;

  @ApiPropertyOptional({ example: 50, description: 'Discount percentage 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/offer-cover.jpg', description: 'Primary hero cover image URL shown on cards' })
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({
    example: ['https://cdn.example.com/img1.jpg'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({
    example: ["Chef's Special", 'Cocktails'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  highlights?: string[];

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
