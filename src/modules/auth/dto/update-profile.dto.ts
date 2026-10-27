import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '+9779812345678' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^(?:\+977)?9\d{9}$/, {
    message: 'Phone number must be a valid Nepali mobile number',
  })
  phone?: string;
}
