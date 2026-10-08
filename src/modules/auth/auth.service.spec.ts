import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    merchantStaff: {
      findFirst: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
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

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: dto.name,
        role: 'USER',
      });
      mockJwtService.signAsync.mockResolvedValue('access-token');
      mockConfigService.get.mockReturnValue('secret');

      const result = await service.register(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      } as any;

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: dto.email,
      });

      await expect(service.register(dto))
        .rejects.toThrow(ConflictException);
    });

    it('should force role to USER regardless of requested role', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'Password123!',
        name: 'Evil User',
        role: 'ADMIN',
      } as any;

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-2',
        email: dto.email,
        role: 'USER',
      });
      mockJwtService.signAsync.mockResolvedValue('access-token');
      mockConfigService.get.mockReturnValue('secret');

      await service.register(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'USER' }),
        }),
      );
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('Password123!', 10),
        role: 'USER',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockJwtService.signAsync.mockResolvedValue('access-token');
      mockConfigService.get.mockReturnValue('secret');

      const result = await service.login(user as any);

      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('Password123!', 10),
        role: 'USER',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(service.login({ ...user, password: 'WrongPassword' } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'test@example.com', password: 'Password123!' } as any))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'USER' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER',
      });
      mockJwtService.signAsync.mockResolvedValue('new-access-token');
      mockConfigService.get.mockReturnValue('secret');

      const result = await service.refreshToken({ refreshToken } as any);

      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('new-access-token');
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(refreshToken, expect.any(Object));
      expect(mockJwtService.signAsync).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid/expired refresh token', async () => {
      const refreshToken = 'invalid-token';

      mockJwtService.verifyAsync.mockRejectedValue(new Error('Token expired'));

      await expect(service.refreshToken({ refreshToken } as any))
        .rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(refreshToken, expect.any(Object));
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'USER' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken({ refreshToken } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'USER' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER',
        isActive: false,
      });

      await expect(service.refreshToken({ refreshToken } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should handle concurrent refresh requests correctly', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'USER' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER',
      });
      mockJwtService.signAsync.mockResolvedValue('new-access-token');
      mockConfigService.get.mockReturnValue('secret');

      // Simulate concurrent refresh requests
      const [result1, result2] = await Promise.all([
        service.refreshToken({ refreshToken } as any),
        service.refreshToken({ refreshToken } as any),
      ]);

      expect(result1).toHaveProperty('accessToken');
      expect(result2).toHaveProperty('accessToken');
    });

    it('should include correct token expiration time in new access token', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'USER' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER',
      });
      mockJwtService.signAsync.mockImplementation((payload) => {
        expect(payload).toHaveProperty('expiresIn');
        return 'new-access-token';
      });
      mockConfigService.get.mockReturnValue('secret');

      await service.refreshToken({ refreshToken } as any);

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          email: 'test@example.com',
          role: 'USER',
        }),
        expect.any(Object)
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully and clear refresh tokens', async () => {
      const userId = 'user-1';

      mockPrismaService.user.update.mockResolvedValue({ id: userId });

      await service.logout(userId);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          refreshTokenHash: null,
        }),
      });
    });

    it('should handle logout for non-existent user gracefully', async () => {
      const userId = 'non-existent-user';

      mockPrismaService.user.update.mockRejectedValue(new Error('User not found'));

      // Should not throw, just log error
      await expect(service.logout(userId)).resolves.toBeUndefined();
    });
  });
});
