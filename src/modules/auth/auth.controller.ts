import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public, RequireApiKey, Roles } from './auth.decorators';
import { UserRole } from './auth.types';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CorrelationId } from '../../common/decorators/correlation-id.decorator';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new customer account' })
  @ApiResponse({ status: 201, description: 'Account registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email & password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Returns access & refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Req() req: Request) {
    const portal = (req.body as any)?.portal;
    return this.authService.login(req.user as any, portal);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate and exchange a refresh token for a new access token',
  })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshToken(dto.refreshToken);
    return { tokens };
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always answers 202 with an identical body, whether or not the address has an account, so accounts cannot be enumerated (T-02-01).',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 202, description: 'Request accepted' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return {
      message:
        'If an account exists for that email address, a password reset link is on its way.',
    };
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a password reset with a single-use token',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Invalid, expired or used token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return {
      message:
        'Your password has been updated. Please sign in with your new password.',
    };
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address with a single-use token' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({ status: 400, description: 'Invalid, expired or used token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { message: 'Your email address has been verified.' };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Re-send the email verification link for the current user',
    description:
      'Always answers 202, including when the address is already verified (T-02-01).',
  })
  @ApiResponse({ status: 202, description: 'Request accepted' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resendVerification(@CurrentUser('id') userId: string) {
    if (userId) {
      await this.authService.resendEmailVerification(userId);
    }
    return {
      message:
        'If your email address still needs verification, a new link is on its way.',
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Log out and revoke active refresh tokens' })
  async logout(@CurrentUser('id') userId: string) {
    if (userId) {
      await this.authService.logout(userId);
    }
    return { message: 'Logged out successfully' };
  }

  @Post('revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke all refresh tokens for the current user' })
  async revokeAll(@CurrentUser('id') userId: string) {
    if (userId) {
      await this.authService.revokeAllTokens(userId);
    }
    return { message: 'All tokens revoked successfully' };
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current authenticated user profile and subscription status',
  })
  async getProfile(
    @CurrentUser('id') userId: string,
    @CorrelationId() correlationId: string,
  ) {
    const user = await this.authService.getUserProfile(userId);
    return { user, correlationId };
  }

  @Patch('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @Public()
  @RequireApiKey()
  @Get('m2m/sync')
  @ApiSecurity('x-api-key')
  @ApiOperation({
    summary:
      'Partner / Machine-to-Machine route protected strictly by x-api-key',
  })
  @ApiResponse({ status: 200, description: 'M2M authenticated data feed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  async m2mSync() {
    return {
      message: 'M2M authenticated sync channel active',
      partnerService: 'OfferNepal B2B Engine',
    };
  }

  @Get('admin/metrics-summary')
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin only role-protected summary' })
  @ApiResponse({ status: 200, description: 'Admin statistics' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getAdminSummary(@CurrentUser() user: AuthenticatedUser) {
    return {
      adminId: user.id,
      systemHealth: 'OPERATIONAL',
      activeSubscribers: 12500,
    };
  }
}
