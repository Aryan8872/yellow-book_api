import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LocationSearchDto {
  @ApiProperty({
    description: 'Search query for location (e.g., "Thamel", "Birtamod")',
    example: 'Birtamod',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  query!: string;

  @ApiPropertyOptional({
    description: 'Latitude used to bias results toward the caller position',
    example: 26.64,
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({
    description: 'Longitude used to bias results toward the caller position',
    example: 87.28,
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lon?: number;
}

export class ReverseGeocodeDto {
  @ApiProperty({ description: 'Latitude of the point to reverse-geocode', example: 26.64 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Longitude of the point to reverse-geocode', example: 87.28 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;
}
