import {
  IsOptional,
  IsBoolean,
  IsString,
  IsEmail,
  IsArray,
  IsIn,
} from 'class-validator';
import { STAFF_PERMISSIONS } from '../../../common/constants/staff-permissions';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
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
  @IsIn([...STAFF_PERMISSIONS], { each: true })
  permissions?: string[];
}
