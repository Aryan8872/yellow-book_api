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
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
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
    return this.authService.login((req as any).user);
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
