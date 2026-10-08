import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ApproveMerchantDto {
  @IsNotEmpty()
  @IsString()
  merchantId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
