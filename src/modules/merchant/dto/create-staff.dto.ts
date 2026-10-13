import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength, MaxLength, IsOptional, IsArray, IsIn, Matches } from 'class-validator';
import { STAFF_PERMISSIONS } from '../../../common/constants/staff-permissions';

export class CreateStaffDto {
  @ApiProperty({ example: 'Ram Bahadur' })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be less than 100 characters' })
  name!: string;

  @ApiProperty({ example: 'ram@merchant.com' })
  @IsEmail({}, { message: 'Invalid email address' })
  @MinLength(5, { message: 'Email must be at least 5 characters' })
  @MaxLength(255, { message: 'Email must be less than 255 characters' })
  email!: string;

  @ApiPropertyOptional({ example: '+9779841234567' })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'SecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password must be less than 100 characters' })
  password!: string;

  @ApiProperty({ enum: ['MERCHANT_STAFF', 'MERCHANT_ADMIN'] })
  @IsString()
  @IsIn(['MERCHANT_STAFF', 'MERCHANT_ADMIN'], { message: 'Invalid role selected' })
  role!: 'MERCHANT_STAFF' | 'MERCHANT_ADMIN';

  @ApiPropertyOptional({ enum: STAFF_PERMISSIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn([...STAFF_PERMISSIONS], { each: true, message: 'Invalid permission' })
  permissions?: string[];
}
