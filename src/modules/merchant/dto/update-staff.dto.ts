import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
