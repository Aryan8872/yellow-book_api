import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'Ram Bahadur' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ram@merchant.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+9779841234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'SecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ['MERCHANT_STAFF', 'MERCHANT_ADMIN'] })
  @IsString()
  role!: 'MERCHANT_STAFF' | 'MERCHANT_ADMIN';
}
