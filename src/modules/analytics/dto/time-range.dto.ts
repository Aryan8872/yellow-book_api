import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TimeRange {
  LAST_7_DAYS = '7d',
  LAST_30_DAYS = '30d',
  CUSTOM = 'custom',
}

export class TimeRangeDto {
  @ApiProperty({
    enum: TimeRange,
    default: TimeRange.LAST_7_DAYS,
    description: 'Time range for analytics query',
  })
  @IsEnum(TimeRange)
  @Type(() => String)
  range: TimeRange = TimeRange.LAST_7_DAYS;

  @ApiPropertyOptional({
    enum: ['daily', 'weekly'],
    default: 'daily',
    description: 'Data granularity for time-based queries',
  })
  @IsOptional()
  @IsEnum(['daily', 'weekly'])
  granularity?: 'daily' | 'weekly' = 'daily';

  @ApiPropertyOptional({
    description: 'Start date in ISO 8601 format (required when range=custom)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date in ISO 8601 format (required when range=custom)',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
