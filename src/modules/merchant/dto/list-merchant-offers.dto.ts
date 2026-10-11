import {
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsIn,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Accepts 'true'/'false' (query strings) and real booleans. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListMerchantOffersDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search by offer title' })
  @IsOptional()
  @IsString()
  search?: string;

  /** Category id or slug (matches the public offers endpoint). */
  @ApiPropertyOptional({ description: 'Filter by category id or slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by featured status' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'updatedAt', 'title', 'estimatedSavingsNpr'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'title', 'estimatedSavingsNpr'])
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'estimatedSavingsNpr' = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}