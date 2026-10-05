import { IsString, IsEmail } from 'class-validator';

export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  role!: 'MERCHANT_STAFF' | 'MERCHANT_ADMIN';
}
