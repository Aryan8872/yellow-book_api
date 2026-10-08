import { IsNotEmpty, IsString } from 'class-validator';

export class RejectMerchantDto {
  @IsNotEmpty()
  @IsString()
  merchantId!: string;

  @IsNotEmpty()
  @IsString()
  reason!: string;
}
