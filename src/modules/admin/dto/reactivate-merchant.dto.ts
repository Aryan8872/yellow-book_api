import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ReactivateMerchantDto {
  @IsNotEmpty()
  @IsString()
  merchantId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
