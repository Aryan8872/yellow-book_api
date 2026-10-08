import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';

export enum FraudReviewDecision {
  CONFIRMED = 'CONFIRMED',
  DISMISSED = 'DISMISSED',
}

export class ReviewFraudDto {
  @IsNotEmpty()
  @IsString()
  fraudFlagId!: string;

  @IsNotEmpty()
  @IsEnum(FraudReviewDecision)
  decision!: FraudReviewDecision;

  @IsOptional()
  @IsString()
  notes?: string;
}
