import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsObject,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { District } from '@prisma/client';

export class CreateBranchDto {
  @ApiProperty({ example: 'Downtown Store' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Bhanimandal, Lazimpat Road' })
  @IsString()
  address!: string;

  @ApiProperty({ enum: District, example: District.KATHMANDU })
  @IsEnum(District)
  district!: District;

  @ApiProperty({ example: 27.7172 })
  @IsNumber()
  @Type(() => Number)
  lat!: number;

  @ApiProperty({ example: 85.324 })
  @IsNumber()
  @Type(() => Number)
  lng!: number;

  @ApiProperty({ example: '+9779841234567' })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({
    example: { monday: { open: '09:00', close: '22:00', closed: false } },
    description:
      'Weekly operating hours keyed by lowercase day name; days omitted are treated as closed',
  })
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, any>;
}
