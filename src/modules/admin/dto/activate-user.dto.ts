import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ActivateUserDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
