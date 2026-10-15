import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import { NotificationsService } from '../notification/notifications.service';
import { hashSecureToken } from './auth.utils';
import { AUTH_CONSTANTS } from './auth.constants';
import { UserRole as PrismaUserRole } from '@prisma/client';

jest.mock('bcrypt');

/** A Prisma user row shaped to USER_SELECT_FIELDS. */
const buildUserRow = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: PrismaUserRole.USER,
  isVerified: false,
  emailVerified: false,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  passwordHash: '$2b$10$hashed',
  subscription: null,
  merchantStaff: null,
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    merchantStaff: {
      findFirst: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockNotificationsService = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  };

  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    redis = mockRedis;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService.get.mockReturnValue('test-secret');
    // generateTokens signs the access and refresh tokens in parallel via
    // signAsync; distinguish them by their expiry option.
    mockJwtService.signAsync.mockImplementation((_payload, options) =>
      Promise.resolve(
        options?.expiresIn === AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS
          ? 'access-token'
          : 'refresh-token',
      ),
    );
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(1);

    // Interactive-transaction form: invoke the callback with the tx client.
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      } as any;

      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(buildUserRow());

      const result = await service.register(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens.accessToken).toBe('access-token');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      } as any;

      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ deletedAt: null }),
      );

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('should force role to USER regardless of requested role', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'Password123!',
        name: 'Evil User',
        role: 'ADMIN',
      } as any;

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(buildUserRow());

      await service.register(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: PrismaUserRole.USER }),
        }),
      );
    });
  });

  describe('login', () => {
    it('should login successfully and return tokens', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: PrismaUserRole.USER,
        subscriptionActive: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());

      const result = await service.login(user as any);

      expect(result).toHaveProperty('tokens');
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('should throw NotFoundException when the user row is missing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ id: 'user-1', email: 'test@example.com' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    // ── Portal guards (Phase 6) ──────────────────────────────────────────

    const merchantStaffRow = (status: string) => ({
      merchantId: 'merchant-1',
      merchant: { status },
    });

    it('rejects a non-ADMIN user from the ADMIN portal', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ role: PrismaUserRole.MERCHANT_ADMIN }),
      );

      await expect(
        service.login({ id: 'user-1', email: 'e@x.com' } as any, 'ADMIN'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admits an ADMIN user to the ADMIN portal', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ role: PrismaUserRole.ADMIN }),
      );

      const result = await service.login(
        { id: 'user-1', email: 'e@x.com' } as any,
        'ADMIN',
      );

      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('rejects a plain USER from the MERCHANT portal', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());

      await expect(
        service.login({ id: 'user-1', email: 'e@x.com' } as any, 'MERCHANT'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a merchant-role user with no staff row from the MERCHANT portal', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ role: PrismaUserRole.MERCHANT_ADMIN, merchantStaff: null }),
      );

      await expect(
        service.login({ id: 'user-1', email: 'e@x.com' } as any, 'MERCHANT'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks staff of a SUSPENDED merchant from the MERCHANT portal', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({
          role: PrismaUserRole.MERCHANT_STAFF,
          merchantStaff: merchantStaffRow('SUSPENDED'),
        }),
      );

      await expect(
        service.login({ id: 'user-1', email: 'e@x.com' } as any, 'MERCHANT'),
      ).rejects.toThrow('currently suspended');
    });

    it('blocks staff of an ARCHIVED merchant from the MERCHANT portal', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({
          role: PrismaUserRole.MERCHANT_STAFF,
          merchantStaff: merchantStaffRow('ARCHIVED'),
        }),
      );

      await expect(
        service.login({ id: 'user-1', email: 'e@x.com' } as any, 'MERCHANT'),
      ).rejects.toThrow('archived or rejected');
    });

    it('admits staff of an ACTIVE merchant and returns merchantId', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({
          role: PrismaUserRole.MERCHANT_STAFF,
          merchantStaff: merchantStaffRow('ACTIVE'),
        }),
      );

      const result = await service.login(
        { id: 'user-1', email: 'e@x.com' } as any,
        'MERCHANT',
      );

      expect(result.tokens.accessToken).toBe('access-token');
      expect((result.user as any).merchantId).toBe('merchant-1');
    });

    it('does not trip any guard for a plain USER portal login', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());

      const result = await service.login(
        { id: 'user-1', email: 'e@x.com' } as any,
        'USER',
      );

      expect(result.tokens.accessToken).toBe('access-token');
    });
  });

  describe('validateUserCredentials', () => {
    it('should return a safe user for valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ passwordHash: '$2b$10$hashed' }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUserCredentials(
        'test@example.com',
        'Password123!',
      );

      expect(result).toMatchObject({ id: 'user-1' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should return null when the password does not match', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUserCredentials('test@example.com', 'wrong'),
      ).resolves.toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should rotate tokens with a valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';

      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockRedis.get.mockResolvedValue(refreshToken);
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ passwordHash: '$2b$10$hashed' }),
      );

      const result = await service.refreshToken(refreshToken);

      expect(result.accessToken).toBe('access-token');
      expect(mockJwtService.verify).toHaveBeenCalledWith(
        refreshToken,
        expect.any(Object),
      );
    });

    it('should throw UnauthorizedException for an invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when the user no longer exists', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockRedis.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('valid-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject and invalidate on refresh-token reuse', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockRedis.get.mockResolvedValue('original-refresh-token');

      await expect(service.refreshToken('replayed-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh tokens on logout', async () => {
      const userId = 'user-1';

      mockPrismaService.user.update.mockResolvedValue({ id: userId });

      await expect(service.logout(userId)).resolves.toBeUndefined();

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining(userId),
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          refreshToken: null,
          refreshTokenExpiresAt: null,
        }),
      });
    });

    it('should not throw when the database update fails', async () => {
      mockPrismaService.user.update.mockRejectedValue(
        new Error('User not found'),
      );

      // Errors are logged, not propagated — logout must always succeed.
      await expect(service.logout('non-existent-user')).resolves.toBeUndefined();
    });
  });

  describe('forgotPassword', () => {
    const dto = { email: 'test@example.com' } as any;

    it('stores only a hash of a fresh token and emails the raw token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await service.forgotPassword(dto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          passwordResetToken: expect.any(String),
          passwordResetExpiresAt: expect.any(Date),
        }),
      });

      const [user, token] =
        mockNotificationsService.sendPasswordReset.mock.calls[0];
      expect(user).toMatchObject({ email: 'test@example.com' });
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      // At-rest value must be the hash, never the raw token (T-02-02).
      const persisted =
        mockPrismaService.user.update.mock.calls[0][0].data.passwordResetToken;
      expect(persisted).toBe(hashSecureToken(token));
      expect(persisted).not.toBe(token);
    });

    it('keeps the token TTL at 15 minutes or less', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await service.forgotPassword(dto);

      const expiresAt: Date =
        mockPrismaService.user.update.mock.calls[0][0].data
          .passwordResetExpiresAt;
      const ttlMinutes = (expiresAt.getTime() - Date.now()) / 60000;
      expect(ttlMinutes).toBeGreaterThan(14);
      expect(ttlMinutes).toBeLessThanOrEqual(15);
    });

    it('returns normally and sends nothing for an unknown account (T-02-01)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'nobody@example.com' } as any),
      ).resolves.toBeUndefined();
      expect(mockNotificationsService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('returns normally and sends nothing for a soft-deleted account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ deletedAt: new Date() }),
      );

      await expect(service.forgotPassword(dto)).resolves.toBeUndefined();
      expect(mockNotificationsService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('does not surface a database failure as a distinct response', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(buildUserRow());
      mockPrismaService.user.update.mockRejectedValue(new Error('db down'));

      await expect(service.forgotPassword(dto)).resolves.toBeUndefined();
      expect(mockNotificationsService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'raw-reset-token', password: 'Password123!' } as any;

    const storedTokenRow = (overrides: Record<string, any> = {}) => ({
      id: 'user-1',
      passwordResetExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      isActive: true,
      deletedAt: null,
      ...overrides,
    });

    it('updates the password, clears the token and revokes sessions', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(storedTokenRow());
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$new');

      await expect(service.resetPassword(dto)).resolves.toBeUndefined();

      // Lookup is by hash, never by the raw token.
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { passwordResetToken: hashSecureToken('raw-reset-token') },
        }),
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          passwordHash: '$2b$10$new',
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      });
      // Refresh tokens are invalidated: Redis key deleted, DB columns nulled.
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
      );
    });

    it('rejects an unknown token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('rejects a reused token because it was cleared on first use', async () => {
      // After a successful reset the stored hash is gone, so the second attempt
      // finds no row at all.
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects and clears an expired token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(
        storedTokenRow({ passwordResetExpiresAt: new Date(Date.now() - 1000) }),
      );
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await expect(service.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordResetToken: null, passwordResetExpiresAt: null },
      });
    });
  });

  describe('verifyEmail', () => {
    const dto = { token: 'raw-verify-token' } as any;

    const storedVerifyRow = (overrides: Record<string, any> = {}) => ({
      id: 'user-1',
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      emailVerified: false,
      ...overrides,
    });

    it('marks the email verified and clears the token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(storedVerifyRow());
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await expect(service.verifyEmail(dto)).resolves.toBeUndefined();

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            emailVerificationToken: hashSecureToken('raw-verify-token'),
          },
        }),
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
        },
      });
    });

    it('rejects an unknown token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('rejects a reused token because it was cleared on first use', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects and clears an expired token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(
        storedVerifyRow({
          emailVerificationExpiresAt: new Date(Date.now() - 1000),
        }),
      );
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await expect(service.verifyEmail(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
        },
      });
    });
  });

  describe('resendEmailVerification', () => {
    it('mints and emails a new token for an unverified user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ emailVerified: false }),
      );
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await expect(
        service.resendEmailVerification('user-1'),
      ).resolves.toBeUndefined();

      const [user, token] =
        mockNotificationsService.sendEmailVerification.mock.calls[0];
      expect(user).toMatchObject({ email: 'test@example.com' });
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(
        mockPrismaService.user.update.mock.calls[0][0].data
          .emailVerificationToken,
      ).toBe(hashSecureToken(token));
    });

    it('sends nothing when the address is already verified (generic 202)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUserRow({ emailVerified: true }),
      );

      await expect(
        service.resendEmailVerification('user-1'),
      ).resolves.toBeUndefined();
      expect(
        mockNotificationsService.sendEmailVerification,
      ).not.toHaveBeenCalled();
    });
  });

  describe('register email verification', () => {
    it('sends a verification email whose token is hashed at rest', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(buildUserRow());
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

      await service.register({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      } as any);

      // Dispatch is fire-and-forget so registration never waits on the mail
      // provider; let the pending microtasks settle before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(
        mockNotificationsService.sendEmailVerification,
      ).toHaveBeenCalledTimes(1);
      const [, token] =
        mockNotificationsService.sendEmailVerification.mock.calls[0];
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      // generateTokens also writes the refresh token, so find the verification
      // write specifically.
      const verificationWrite = mockPrismaService.user.update.mock.calls
        .map((call) => call[0])
        .find((arg) => arg.data?.emailVerificationToken !== undefined);
      expect(verificationWrite?.data.emailVerificationToken).toBe(
        hashSecureToken(token),
      );
    });
  });
});
