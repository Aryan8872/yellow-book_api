import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffPermissionGuard } from './staff-permission.guard';
import { STAFF_PERMISSION_KEY } from '../auth.decorators';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AppErrorCode } from '../../../common/constants/error-codes';

describe('StaffPermissionGuard', () => {
  let guard: StaffPermissionGuard;

  const mockPrisma = {
    merchantStaff: {
      findUnique: jest.fn(),
    },
  };

  /** ExecutionContext whose Reflector returns the given permissions. */
  const contextWith = (user: any, permissions: string[] | null) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => function handler() {},
      getClass: () => class Ctrl {},
    }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffPermissionGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn((_key: string, _targets: any[]) =>
              // Read the permissions from the context mock via closure below;
              // default is set per-test by overriding this fn.
              (mockReflectorReturn.permissions as any) ?? [],
            ),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get(StaffPermissionGuard);
  });

  // Track the permissions the fake Reflector should return for the current test.
  const mockReflectorReturn: { permissions: string[] | null } = {
    permissions: null,
  };

  const withPermissions = (
    user: any,
    permissions: string[] | null,
  ): ReturnType<typeof contextWith> => {
    mockReflectorReturn.permissions = permissions;
    return contextWith(user, permissions);
  };

  it('passes through when no permission metadata is declared', async () => {
    await expect(
      guard.canActivate(withPermissions({ id: 'u1', role: 'MERCHANT_STAFF' }, null)),
    ).resolves.toBe(true);
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(
      guard.canActivate(withPermissions(undefined, ['redeem'])),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets ADMIN bypass the granular check without a DB lookup', async () => {
    await expect(
      guard.canActivate(withPermissions({ id: 'a1', role: 'ADMIN' }, ['redeem'])),
    ).resolves.toBe(true);
    expect(mockPrisma.merchantStaff.findUnique).not.toHaveBeenCalled();
  });

  it('lets MERCHANT_ADMIN bypass the granular check', async () => {
    await expect(
      guard.canActivate(
        withPermissions({ id: 'm1', role: 'MERCHANT_ADMIN' }, ['redeem']),
      ),
    ).resolves.toBe(true);
  });

  it('rejects when the caller has no staff row', async () => {
    mockPrisma.merchantStaff.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        withPermissions({ id: 'u1', role: 'MERCHANT_STAFF' }, ['redeem']),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
      }),
    } as any);
  });

  it('rejects an inactive staff member', async () => {
    mockPrisma.merchantStaff.findUnique.mockResolvedValue({
      isActive: false,
      permissions: ['redeem'],
    });

    await expect(
      guard.canActivate(
        withPermissions({ id: 'u1', role: 'MERCHANT_STAFF' }, ['redeem']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('grants access when all required permissions are held', async () => {
    mockPrisma.merchantStaff.findUnique.mockResolvedValue({
      isActive: true,
      permissions: ['read', 'redeem'],
    });

    await expect(
      guard.canActivate(
        withPermissions({ id: 'u1', role: 'MERCHANT_STAFF' }, ['redeem']),
      ),
    ).resolves.toBe(true);
  });

  it('uses all-of semantics: one missing permission rejects', async () => {
    mockPrisma.merchantStaff.findUnique.mockResolvedValue({
      isActive: true,
      permissions: ['read'],
    });

    await expect(
      guard.canActivate(
        withPermissions({ id: 'u1', role: 'MERCHANT_STAFF' }, ['read', 'redeem']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('treats a null permissions array as empty', async () => {
    mockPrisma.merchantStaff.findUnique.mockResolvedValue({
      isActive: true,
      permissions: null,
    });

    await expect(
      guard.canActivate(
        withPermissions({ id: 'u1', role: 'MERCHANT_STAFF' }, ['read']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
