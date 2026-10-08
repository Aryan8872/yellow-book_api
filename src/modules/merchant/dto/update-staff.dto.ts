import { IsOptional, IsBoolean, IsString, IsEmail } from 'class-validator';

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
}
