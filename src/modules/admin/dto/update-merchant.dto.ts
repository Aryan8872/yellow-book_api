import { IsOptional, IsString, IsEnum, IsEmail, IsUrl, MinLength, MaxLength, Matches } from 'class-validator';
import { MerchantStatus } from '@prisma/client';

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid international format'
  })
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  panNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string;

  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @IsOptional()
  @IsUrl()
  coverUrl?: string;
}
