import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MinLength, MaxLength, Matches, IsNumber, Min, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMerchantDto {
  @IsString()
  @MinLength(2, { message: 'Business name must be at least 2 characters' })
  @MaxLength(200, { message: 'Business name must be less than 200 characters' })
  @IsNotEmpty({ message: 'Business name is required' })
  name!: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @MinLength(5, { message: 'Email must be at least 5 characters' })
  @MaxLength(255, { message: 'Email must be less than 255 characters' })
  @IsNotEmpty({ message: 'Contact email is required' })
  contactEmail!: string;

  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @MaxLength(1000, { message: 'Description must be less than 1000 characters' })
  @IsOptional()
  description?: string;

  @IsUrl({}, { message: 'Invalid website URL' })
  @IsOptional()
  websiteUrl?: string;

  @IsString()
  @MaxLength(50, { message: 'PAN number must be less than 50 characters' })
  @IsOptional()
  panNumber?: string;

  @IsString()
  @MaxLength(50, { message: 'VAT number must be less than 50 characters' })
  @IsOptional()
  vatNumber?: string;

  @IsString()
  @MaxLength(500, { message: 'Address must be less than 500 characters' })
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  logoImage?: string;

  @IsString()
  @IsOptional()
  coverUrl?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  // ─── Initial Subscription (optional) ───────────────────────────────────────

  @ApiPropertyOptional({ description: 'Initial subscription plan ID to assign upon creation' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Duration in days for the initial subscription (defaults to plan default)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Whether to mark the initial subscription as a trial', default: false })
  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;
}
