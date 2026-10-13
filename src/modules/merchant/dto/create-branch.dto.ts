import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsObject,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { District } from '@prisma/client';

export class CreateBranchDto {
  @ApiProperty({ example: 'Downtown Store' })
  @IsString()
  @MinLength(2, { message: 'Branch name must be at least 2 characters' })
  @MaxLength(200, { message: 'Branch name must be less than 200 characters' })
  name!: string;

  @ApiProperty({ example: 'Bhanimandal, Lazimpat Road' })
  @IsString()
  @MinLength(5, { message: 'Address must be at least 5 characters' })
  @MaxLength(500, { message: 'Address must be less than 500 characters' })
  address!: string;

  @ApiProperty({ enum: District, example: District.KATHMANDU })
  @IsEnum(District, { message: 'Invalid district selected' })
  district!: District;

  @ApiProperty({ example: 27.7172 })
  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  @Type(() => Number)
  lat!: number;

  @ApiProperty({ example: 85.324 })
  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  @Type(() => Number)
  lng!: number;

  @ApiProperty({ example: '+9779841234567' })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
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
