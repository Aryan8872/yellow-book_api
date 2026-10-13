import { IsEmail, IsNotEmpty, IsOptional, IsString, IsEnum, MinLength, MaxLength, IsUrl, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MinLength(5, { message: 'Email must be at least 5 characters' })
  @MaxLength(255, { message: 'Email must be less than 255 characters' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(100, { message: 'Password must be less than 100 characters' })
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be less than 100 characters' })
  @IsOptional()
  name?: string;

  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  @IsOptional()
  phone?: string;

  @IsEnum(UserRole, { message: 'Invalid role selected' })
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  merchantId?: string;

  @IsUrl({}, { message: 'Invalid avatar URL' })
  @IsOptional()
  avatarUrl?: string;
}
