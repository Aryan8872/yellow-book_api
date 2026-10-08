import { IsNotEmpty, IsString } from 'class-validator';

export class SuspendUserDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsNotEmpty()
  @IsString()
  reason!: string;
}
