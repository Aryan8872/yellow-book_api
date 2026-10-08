import { IsString, IsOptional, IsEmail, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMerchantDto {
  @ApiProperty({
    description: 'Merchant name',
    example: 'Burger House & Crunchy Fried Chicken',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Merchant description',
    example: 'Nepal\'s premier homegrown burger hub serving crispy artisan burgers.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Logo image URL',
    example: 'https://example.com/logo.png',
  })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Cover image URL',
    example: 'https://example.com/cover.jpg',
  })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({
    description: 'Website URL',
    example: 'https://burgerhouse.com.np',
  })
  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Contact email',
    example: 'contact@burgerhouse.com',
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+977-9801234567',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Business registration number',
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({
    description: 'VAT number',
    example: 'VAT987654321',
  })
  @IsOptional()
  @IsString()
  vatNumber?: string;
}
