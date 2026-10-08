import { IsOptional, IsBoolean, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { District } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListBranchesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by merchant ID',
  })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({
    enum: District,
    description: 'Filter by district',
  })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({
    description: 'Filter by active status',
  })
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}
