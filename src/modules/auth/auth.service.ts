import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
  NotFoundException,
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
import { UserRole, JwtPayload, SafeUser, AuthTokens } from './auth.types';
import { AUTH_CONSTANTS, USER_SELECT_FIELDS, USER_SELECT_WITH_PASSWORD } from './auth.constants';
import {
  mapPrismaRoleToAppRole,
  normalizeEmail,
  isSubscriptionActive,
  getRefreshTokenKey,
} from './auth.utils';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
          role: (dto.role as unknown as PrismaUserRole) ?? PrismaUserRole.USER,
          isVerified: false,
          isActive: true,
        },
        select: USER_SELECT_FIELDS,
      });
    });

    const tokens = await this.generateTokens(newUser);
    return { user: this.toSafeUser(newUser), tokens };
  }

  /**
   * Logs in an already-validated user (called after validateUserCredentials).
   */
  async login(
    user: SafeUser & { role: string; subscriptionActive?: boolean },
  ): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const tokens = await this.generateTokens(user);
    return { user, tokens };
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
    try {
      const decoded = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ||
          AUTH_CONSTANTS.DEFAULT_REFRESH_SECRET,
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
   * Invalidates the user's refresh token in Redis.
   */
  async logout(userId: string): Promise<void> {
    try {
      await this.redis.del(getRefreshTokenKey(userId));
    } catch (err) {
      this.logger.error(`Failed to delete refresh token for user ${userId}`, err);
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
  // Private Helpers
  // ─────────────────────────────────────────────────────────

  private toSafeUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: PrismaUserRole;
    isVerified: boolean;
    isActive: boolean;
    createdAt: Date;
    subscription?: { status: string; endsAt: Date | null } | null;
    merchantStaff?: { merchantId: string } | null;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: mapPrismaRoleToAppRole(user.role),
      isVerified: user.isVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
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

    const jwtSecret =
      this.config.get<string>('JWT_SECRET') ||
      AUTH_CONSTANTS.DEFAULT_JWT_SECRET;

    const refreshSecret =
      this.config.get<string>('JWT_REFRESH_SECRET') ||
      AUTH_CONSTANTS.DEFAULT_REFRESH_SECRET;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
      }),
      this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: refreshSecret,
          expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_SECONDS,
        },
      ),
    ]);

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
}
