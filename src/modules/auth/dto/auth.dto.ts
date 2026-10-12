import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@offernepal.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;

  @ApiProperty({example:'John doe'})
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!:string;

  @ApiProperty({ example: 'SecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  password!: string;

  @ApiPropertyOptional({ example: '+9779841234567' })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid international format'
  })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@offernepal.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'MERCHANT', 'USER'], description: 'Client portal context to enforce strict role access' })
  @IsString()
  @IsOptional()
  portal?: 'ADMIN' | 'MERCHANT' | 'USER';
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token issued during login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@offernepal.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The raw single-use token from the reset email' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  @ApiProperty({ example: 'NewSecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'The raw single-use token from the verification email' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;
}
