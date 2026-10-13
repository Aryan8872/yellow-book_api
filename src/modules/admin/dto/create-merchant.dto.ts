import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MinLength, MaxLength, Matches } from 'class-validator';

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
  @IsOptional()
  address?: string;

  @IsUrl({}, { message: 'Invalid logo URL' })
  @IsOptional()
  logoUrl?: string;

  @IsUrl({}, { message: 'Invalid cover URL' })
  @IsOptional()
  coverUrl?: string;
}
