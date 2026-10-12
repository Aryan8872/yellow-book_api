import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UserRole as PrismaUserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import { RegisterDto } from './dto/auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserRole, JwtPayload, SafeUser, AuthTokens } from './auth.types';
import { AUTH_CONSTANTS, USER_SELECT_FIELDS, USER_SELECT_WITH_PASSWORD } from './auth.constants';
import {
  mapPrismaRoleToAppRole,
  normalizeEmail,
  isSubscriptionActive,
  getRefreshTokenKey,
  generateSecureToken,
  hashSecureToken,
  passwordResetExpiry,
  emailVerificationExpiry,
} from './auth.utils';
import { NotificationsService } from '../notification/notifications.service';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';

/**
 * Identical wording for every reset-token failure so an attacker cannot tell
 * "no such token" from "expired" from "already used" (T-02-02).
 */
const INVALID_RESET_TOKEN_MESSAGE =
  'This password reset link is invalid or has expired. Please request a new one.';

const INVALID_VERIFICATION_TOKEN_MESSAGE =
  'This verification link is invalid or has expired. Please request a new one.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Validates email/password credentials. Returns user without passwordHash.
   */
  async validateUserCredentials(
    email: string,
    pass: string,
  ): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: USER_SELECT_WITH_PASSWORD,
    });

    if (!user || user.deletedAt !== null) return null;
    if (!user.isActive) return null;
    if (!user.passwordHash) return null; // OAuth-only account

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) return null;

    return this.toSafeUser(user);
  }

  /**
   * Registers a new user with hashed password.
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const emailKey = normalizeEmail(dto.email);
    const passwordHash = await bcrypt.hash(
      dto.password,
      AUTH_CONSTANTS.BCRYPT_ROUNDS,
    );

    // Use transaction to prevent race condition on email uniqueness
    const newUser = await this.prisma.$transaction(async (tx) => {
      // Check for existing account (email) within transaction
      const existing = await tx.user.findUnique({
        where: { email: emailKey },
        select: { id: true, deletedAt: true },
      });

      if (existing) {
        if (existing.deletedAt) {
          // Soft-deleted: restore the account instead of throwing
          this.logger.warn(
            `Restoring soft-deleted account for email: ${emailKey}`,
          );
        } else {
          throw new ConflictException('User with this email already exists');
        }
      }

      return tx.user.create({
        data: {
          email: emailKey,
          passwordHash,
          name: dto.name ?? null,
          phone: dto.phone ?? null,
          // Public self-registration always creates a base USER account.
          // Elevated roles (MERCHANT_*, ADMIN) are granted via admin flows only.
          role: PrismaUserRole.USER,
          isVerified: false,
          isActive: true,
        },
        select: USER_SELECT_FIELDS,
      });
    });

    const tokens = await this.generateTokens(newUser);

    // Fire-and-forget: registration must not depend on an external mail
    // provider's latency, and a delivery failure must not fail signup
    // (the user can always request a new link via /auth/resend-verification).
    void this.mintAndSendEmailVerification(newUser);

    return { user: this.toSafeUser(newUser), tokens };
  }

  /**
   * Logs in an already-validated user (called after validateUserCredentials).
   */
  async login(
    user: SafeUser & { role: string; subscriptionActive?: boolean },
    portal?: 'ADMIN' | 'MERCHANT' | 'USER',
  ): Promise<{ user: SafeUser & { merchantId?: string }; tokens: AuthTokens }> {
    // Fetch full user with merchantStaff relation for token generation
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: USER_SELECT_FIELDS,
    });

    if (!fullUser) {
      throw new NotFoundException('User not found');
    }

    // Ensure role is properly mapped from Prisma enum to app enum
    const mappedRole = mapPrismaRoleToAppRole(fullUser.role);

    // 1. Strict Admin Portal Guard: Only ADMIN role is authorized to login
    if (portal === 'ADMIN' && mappedRole !== UserRole.ADMIN) {
      this.logger.warn(
        `User ${fullUser.email} (role: ${mappedRole}) rejected from admin portal login`,
      );
      throw new ForbiddenException('Access denied: Administrator privileges required');
    }

    // 2. Strict Merchant Portal Guard
    if (portal === 'MERCHANT') {
      const isMerchantRole =
        mappedRole === UserRole.MERCHANT_ADMIN || mappedRole === UserRole.MERCHANT_STAFF;

      if (!isMerchantRole || !fullUser.merchantStaff) {
        this.logger.warn(
          `User ${fullUser.email} (role: ${mappedRole}) rejected from merchant portal login (not affiliated)`,
        );
        throw new ForbiddenException(
          'Access denied: You are not authorized as merchant staff or administrator',
        );
      }

      // Check merchant status
      const merchantStatus = fullUser.merchantStaff.merchant?.status;
      if (merchantStatus === 'SUSPENDED') {
        this.logger.warn(
          `User ${fullUser.email} blocked from login: merchant ${fullUser.merchantStaff.merchantId} is SUSPENDED`,
        );
        throw new ForbiddenException(
          'Your merchant account is currently suspended. Please contact platform administration.',
        );
      }

      if (merchantStatus === 'ARCHIVED') {
        this.logger.warn(
          `User ${fullUser.email} blocked from login: merchant ${fullUser.merchantStaff.merchantId} is ARCHIVED`,
        );
        throw new ForbiddenException(
          'Your merchant account has been archived or rejected. Access is disabled.',
        );
      }
    }

    const tokens = await this.generateTokens({
      ...fullUser,
      role: mappedRole,
    });

    const userWithMerchantId = {
      ...user,
      merchantId: fullUser.merchantStaff?.merchantId,
    };

    return { user: userWithMerchantId, tokens };
  }

  /**
   * Get full user profile with merchant information
   */
  async getUserProfile(userId: string): Promise<SafeUser & { merchantId?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT_FIELDS,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Extract merchantId from merchantStaff relation if exists
    const merchantId = user.merchantStaff?.merchantId;

    return {
      ...this.toSafeUser(user),
      merchantId,
    };
  }

  /**
   * OAuth upsert: find or create user by provider/providerId.
   */
  async validateOAuthLogin(profile: {
    provider: string;
    providerId: string;
    email: string;
    name: string;
  }): Promise<SafeUser> {
    const emailKey = normalizeEmail(profile.email);

    // Use transaction to ensure atomic OAuth account creation
    const user = await this.prisma.$transaction(async (tx) => {
      // Try to find existing OAuth account linkage
      const oauthAccount = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerId: {
            provider: profile.provider.toUpperCase() as never,
            providerId: profile.providerId,
          },
        },
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
        },
      });

      if (oauthAccount) {
        return oauthAccount.user;
      }

      // Upsert user by email (link OAuth to existing email account)
      return tx.user.upsert({
        where: { email: emailKey },
        create: {
          email: emailKey,
          name: profile.name,
          role: PrismaUserRole.USER,
          isVerified: true, // OAuth emails are verified by the provider
          emailVerified: true, // same guarantee for the new email flag
          isActive: true,
          oauthAccounts: {
            create: {
              provider: profile.provider.toUpperCase() as never,
              providerId: profile.providerId,
            },
          },
        },
        update: {
          // Link OAuth to existing account if not already linked
          oauthAccounts: {
            create: {
              provider: profile.provider.toUpperCase() as never,
              providerId: profile.providerId,
            },
          },
          // The provider has already proven ownership of this address.
          emailVerified: true,
        },
        select: USER_SELECT_FIELDS,
      });
    });

    return this.toSafeUser(user);
  }

  /**
   * Refresh token rotation with reuse detection.
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new UnauthorizedException('Server authentication is not configured');
    }
    try {
      const decoded = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret: refreshSecret,
      });

      const tokenKey = getRefreshTokenKey(decoded.sub);
      const storedToken = await this.redis.get(tokenKey);

      if (storedToken && storedToken !== refreshToken) {
        // Refresh token reuse detected → invalidate all sessions
        await this.redis.del(tokenKey);
        this.logger.warn(
          `Refresh token reuse detected for user: ${decoded.sub}`,
        );
        throw new UnauthorizedException(
          'Token reuse detected. Please log in again.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        select: USER_SELECT_WITH_PASSWORD,
      });

      if (!user || user.deletedAt || !user.isActive) {
        throw new UnauthorizedException('User account no longer exists');
      }

      return this.generateTokens(this.toSafeUser(user));
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Invalidates the user's refresh token in Redis and database.
   */
  async logout(userId: string): Promise<void> {
    try {
      await this.redis.del(getRefreshTokenKey(userId));
    } catch (err) {
      this.logger.error(`Failed to delete refresh token from Redis for user ${userId}`, err);
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          refreshToken: null,
          refreshTokenExpiresAt: null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to delete refresh token from database for user ${userId}`, err);
    }
  }

  /**
   * Invalidates all user sessions (revokes all refresh tokens).
   */
  async revokeAllTokens(userId: string): Promise<void> {
    try {
      await this.redis.del(getRefreshTokenKey(userId));
    } catch (err) {
      this.logger.error(`Failed to delete refresh token from Redis for user ${userId}`, err);
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          refreshToken: null,
          refreshTokenExpiresAt: null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to revoke tokens for user ${userId}`, err);
    }
  }

  /**
   * Get full user profile by ID.
   */
  async getUserById(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT_FIELDS,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(user);
  }

  // ─────────────────────────────────────────────────────────
  // Password reset (T-02-01, T-02-02)
  // ─────────────────────────────────────────────────────────

  /**
   * Starts a password reset.
   *
   * ALWAYS returns normally — the controller answers with a generic 202 so the
   * endpoint cannot be used to enumerate accounts (T-02-01). Unknown,
   * soft-deleted and deactivated accounts get the identical response and no
   * email.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      this.logger.log(`Password reset requested for unknown account: ${email}`);
      return;
    }

    const token = generateSecureToken();

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          // Only the hash is persisted; the raw token exists solely in the email.
          passwordResetToken: hashSecureToken(token),
          passwordResetExpiresAt: passwordResetExpiry(),
        },
      });
    } catch (err) {
      // Swallowed on purpose: surfacing a DB error here would distinguish real
      // accounts from fake ones and re-open the enumeration hole.
      this.logger.error(
        `Failed to persist password reset token for user ${user.id}`,
        err,
      );
      return;
    }

    await this.notifications.sendPasswordReset(
      { email: user.email, name: user.name },
      token,
    );
  }

  /**
   * Completes a password reset with a single-use token.
   *
   * Rejects unknown, already-used and expired tokens with the same message so
   * nothing can be inferred from the error (T-02-02).
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashSecureToken(dto.token.trim());

    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: tokenHash },
      select: {
        id: true,
        passwordResetExpiresAt: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    if (
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      // Clear the stale token so it can never be replayed.
      await this.clearPasswordResetToken(user.id);
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      AUTH_CONSTANTS.BCRYPT_ROUNDS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // Single use: the token is consumed by this very update.
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    // Anyone holding a session from before the reset must be logged out.
    await this.revokeAllTokens(user.id);
  }

  // ─────────────────────────────────────────────────────────
  // Email verification (T-02-03)
  // ─────────────────────────────────────────────────────────

  /**
   * Verifies an email address with a single-use token.
   *
   * Reuses the same "identical error" rule as password reset.
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = hashSecureToken(dto.token.trim());

    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: tokenHash },
      select: {
        id: true,
        emailVerificationExpiresAt: true,
        emailVerified: true,
      },
    });

    if (!user || user.emailVerified) {
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      await this.clearEmailVerificationToken(user.id);
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });
  }

  /**
   * Re-issues a verification email for the authenticated user.
   *
   * Returns without effect (and without an email) when the address is already
   * verified, so the caller's response is always the same generic 202.
   */
  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || user.emailVerified) {
      this.logger.log(
        `Verification resend requested for already-verified account: ${userId}`,
      );
      return;
    }

    await this.mintAndSendEmailVerification(user);
  }

  // ─────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────

  private toSafeUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: PrismaUserRole;
    isVerified: boolean;
    emailVerified?: boolean;
    isActive: boolean;
    createdAt: Date;
    subscription?: { status: string; endsAt: Date | null } | null;
    merchantStaff?: { merchantId: string } | null;
  }): SafeUser & { merchantId?: string } {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: mapPrismaRoleToAppRole(user.role),
      isVerified: user.isVerified,
      emailVerified: user.emailVerified ?? false,
      isActive: user.isActive,
      createdAt: user.createdAt,
      merchantId: user.merchantStaff?.merchantId,
    };
  }

  /**
   * Mints a single-use email-verification token, persists only its hash and
   * sends the raw token by email. Never throws: callers must not be able to
   * distinguish "email failed" from "email sent".
   */
  private async mintAndSendEmailVerification(user: {
    id: string;
    email: string;
    name: string | null;
  }): Promise<void> {
    const token = generateSecureToken();

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: hashSecureToken(token),
          emailVerificationExpiresAt: emailVerificationExpiry(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist email verification token for user ${user.id}`,
        err,
      );
      return;
    }

    await this.notifications.sendEmailVerification(
      { email: user.email, name: user.name },
      token,
    );
  }

  private async clearPasswordResetToken(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordResetToken: null, passwordResetExpiresAt: null },
      });
    } catch (err) {
      this.logger.error(
        `Failed to clear password reset token for user ${userId}`,
        err,
      );
    }
  }

  private async clearEmailVerificationToken(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to clear email verification token for user ${userId}`,
        err,
      );
    }
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    role: string;
    subscription?: { status: string; endsAt: Date | null } | null;
    merchantStaff?: { merchantId: string } | null;
  }): Promise<AuthTokens> {
    const subscriptionActive = isSubscriptionActive(user.subscription?.status ?? null);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
      merchantId: user.merchantStaff?.merchantId,
      subscriptionActive,
    };

    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      // Fail fast: signing with a hardcoded fallback secret would be
      // trivially forgeable if it ever reached production.
      throw new Error('JWT_SECRET environment variable is required');
    }

    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is required');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_SECONDS,
      }),
    ]);

    // Calculate refresh token expiration date
    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setSeconds(
      refreshTokenExpiresAt.getSeconds() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_SECONDS,
    );

    // Store refresh token in database as fallback
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiresAt,
        },
      });
    } catch (err) {
      this.logger.error('Failed to store refresh token in database', err);
    }

    // Store latest refresh token in Redis for rotation/reuse detection
    try {
      await this.redis.set(
        getRefreshTokenKey(user.id),
        refreshToken,
        'EX',
        AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_SECONDS,
      );
    } catch (err) {
      // Redis is optional for token storage; auth still works without it
      this.logger.warn('Redis unavailable for refresh token storage', err);
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.avatarUrl && { avatarUrl: dto.avatarUrl }),
        ...(dto.timezone && { timezone: dto.timezone }),
      },
      select: { id: true, email: true, name: true, avatarUrl: true, timezone: true },
    });
  }
}
