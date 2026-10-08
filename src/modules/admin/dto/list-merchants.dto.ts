import { IsOptional, IsEnum, IsInt, Min, IsString, IsEnum as IsEnumValidator } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListMerchantsDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: MerchantStatus,
    description: 'Filter by merchant status',
  })
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;
}
