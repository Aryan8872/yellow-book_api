import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class SuspendMerchantDto {
  @IsNotEmpty()
  @IsString()
  merchantId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
