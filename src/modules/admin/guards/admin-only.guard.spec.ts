import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminOnlyGuard } from './admin-only.guard';
import { AppErrorCode } from '../../../common/constants/error-codes';

describe('AdminOnlyGuard', () => {
  let guard: AdminOnlyGuard;

  const contextWith = (request: Record<string, any>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Ctrl {},
    }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminOnlyGuard],
    }).compile();

    guard = module.get(AdminOnlyGuard);
  });

  it('rejects an unauthenticated request with UNAUTHORIZED', () => {
    expect(() => guard.canActivate(contextWith({}))).toThrow(
      ForbiddenException,
    );
    try {
      guard.canActivate(contextWith({}));
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        errorCode: AppErrorCode.UNAUTHORIZED,
      });
    }
  });

  it('rejects a non-ADMIN role with INSUFFICIENT_PERMISSIONS and role details', () => {
    expect(() =>
      guard.canActivate(contextWith({ user: { id: 'u1', role: 'MERCHANT_ADMIN' } })),
    ).toThrow(ForbiddenException);
    try {
      guard.canActivate(
        contextWith({ user: { id: 'u1', role: 'MERCHANT_ADMIN' } }),
      );
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
        details: { userRole: 'MERCHANT_ADMIN', requiredRole: 'ADMIN' },
      });
    }
  });

  it('allows an ADMIN user', () => {
    expect(
      guard.canActivate(contextWith({ user: { id: 'a1', role: 'ADMIN' } })),
    ).toBe(true);
  });
});
