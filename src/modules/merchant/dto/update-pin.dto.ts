import { IsString, MinLength } from 'class-validator';

export class UpdatePinDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string; // Merchant's password for verification

  @IsString()
  newPin!: string;
}
