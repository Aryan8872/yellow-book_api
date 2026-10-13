import {
  IsOptional,
  IsBoolean,
  IsString,
  IsEmail,
  IsArray,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { STAFF_PERMISSIONS } from '../../../common/constants/staff-permissions';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be less than 100 characters' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  @MinLength(5, { message: 'Email must be at least 5 characters' })
  @MaxLength(255, { message: 'Email must be less than 255 characters' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MERCHANT_STAFF', 'MERCHANT_ADMIN'], { message: 'Invalid role selected' })
  role?: 'MERCHANT_STAFF' | 'MERCHANT_ADMIN';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Granular staff capabilities (Task 9). When provided, replaces the staff
   * member's permissions array. Validated against the allowed set so an
   * unknown string can never be persisted.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn([...STAFF_PERMISSIONS], { each: true, message: 'Invalid permission' })
  permissions?: string[];
}
