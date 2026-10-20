import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LocationSearchDto {
  @ApiProperty({
    description: 'Search query for location (e.g., "Thamel", "Pokhara")',
    example: 'Thamel',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  query!: string;
}

export class LocationResultDto {
  @ApiProperty({ description: 'Formatted address' })
  formattedAddress!: string;

  @ApiProperty({ description: 'Latitude' })
  lat!: number;

  @ApiProperty({ description: 'Longitude' })
  lon!: number;

  @ApiProperty({ description: 'City name', required: false })
  city?: string;

  @ApiProperty({ description: 'Country code', required: false })
  country?: string;
}
