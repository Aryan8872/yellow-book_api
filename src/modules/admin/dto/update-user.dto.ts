import { IsOptional, IsString, IsBoolean, MinLength, MaxLength, IsEnum, IsUrl, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be less than 100 characters' })
  name?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid role selected' })
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid avatar URL' })
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;
}
