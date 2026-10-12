import { IsString, IsOptional, IsEmail, MinLength, MaxLength, Matches, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMerchantDto {
  @ApiProperty({
    description: 'Merchant name',
    example: 'Burger House & Crunchy Fried Chicken',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Merchant description',
    example: 'Nepal\'s premier homegrown burger hub serving crispy artisan burgers.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Logo image URL',
    example: 'https://example.com/logo.png',
  })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Cover image URL',
    example: 'https://example.com/cover.jpg',
  })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiPropertyOptional({
    description: 'Website URL',
    example: 'https://burgerhouse.com.np',
  })
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Contact email',
    example: 'contact@burgerhouse.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+977-9801234567',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid international format'
  })
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Business registration number (PAN)',
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  registrationNumber?: string;

  @ApiPropertyOptional({
    description: 'PAN number (alias for registration number)',
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  panNumber?: string;

  @ApiPropertyOptional({
    description: 'VAT number',
    example: 'VAT987654321',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string;
}
