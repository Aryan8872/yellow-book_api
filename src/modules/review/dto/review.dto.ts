import { IsInt, IsString, IsOptional, IsBoolean, IsArray, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReviewStatus {
  PUBLISHED = 'PUBLISHED',
  PENDING = 'PENDING',
  HIDDEN = 'HIDDEN',
  DELETED = 'DELETED',
}

export enum ReviewReportReason {
  SPAM = 'SPAM',
  OFFENSIVE = 'OFFENSIVE',
  INACCURATE = 'INACCURATE',
  OTHER = 'OTHER',
}

export class CreateReviewDto {
  @IsString()
  @IsOptional()
  offerId?: string;

  @IsString()
  @IsOptional()
  merchantId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  comment: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}

export class UpdateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}

export class QueryReviewsDto {
  @IsString()
  @IsOptional()
  offerId?: string;

  @IsString()
  @IsOptional()
  merchantId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  rating?: number;

  @IsEnum(ReviewStatus)
  @IsOptional()
  status?: ReviewStatus;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isVerified?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @IsString()
  @IsOptional()
  sortBy?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

export class CreateHelpfulVoteDto {
  @IsString()
  reviewId: string;
}

export class CreateReviewReportDto {
  @IsString()
  reviewId: string;

  @IsEnum(ReviewReportReason)
  reason: ReviewReportReason;

  @IsString()
  @IsOptional()
  comment?: string;
}

export class UpdateReviewStatusDto {
  @IsEnum(ReviewStatus)
  status: ReviewStatus;

  @IsString()
  @IsOptional()
  moderationNote?: string;
}
