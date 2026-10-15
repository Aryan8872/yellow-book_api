import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MerchantOwnershipGuard } from './merchant-ownership.guard';
import { AppErrorCode } from '../../../common/constants/error-codes';

describe('MerchantOwnershipGuard', () => {
  let guard: MerchantOwnershipGuard;

  const contextWith = (request: Record<string, any>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Ctrl {},
    }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MerchantOwnershipGuard],
    }).compile();

    guard = module.get(MerchantOwnershipGuard);
  });

  it('rejects an unauthenticated request', () => {
    expect(() => guard.canActivate(contextWith({ params: {} }))).toThrow(
      ForbiddenException,
    );
  });

  it('lets ADMIN access any merchant', () => {
    expect(
      guard.canActivate(
        contextWith({
          user: { id: 'a1', role: 'ADMIN' },
          params: { merchantId: 'any' },
        }),
      ),
    ).toBe(true);
  });

  it('resolves merchantId from params.merchantId', () => {
    expect(
      guard.canActivate(
        contextWith({
          user: { id: 'm1', role: 'MERCHANT_ADMIN', merchantId: 'mer-1' },
          params: { merchantId: 'mer-1' },
        }),
      ),
    ).toBe(true);
  });

  it('falls back to params.id then body.merchantId', () => {
    expect(
      guard.canActivate(
        contextWith({
          user: { id: 'm1', role: 'MERCHANT_STAFF', merchantId: 'mer-1' },
          params: { id: 'mer-1' },
          body: {},
        }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        contextWith({
          user: { id: 'm1', role: 'MERCHANT_STAFF', merchantId: 'mer-1' },
          params: {},
          body: { merchantId: 'mer-1' },
        }),
      ),
    ).toBe(true);
  });

  it('rejects a merchant user with no merchantId association (FORBIDDEN)', () => {
    try {
      guard.canActivate(
        contextWith({
          user: { id: 'm1', role: 'MERCHANT_ADMIN' },
          params: { merchantId: 'mer-1' },
        }),
      );
      fail('expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        errorCode: AppErrorCode.FORBIDDEN,
      });
    }
  });

  it('rejects a merchant user accessing another merchant, with details', () => {
    try {
      guard.canActivate(
        contextWith({
          user: { id: 'm1', role: 'MERCHANT_ADMIN', merchantId: 'mer-1' },
          params: { merchantId: 'mer-2' },
        }),
      );
      fail('expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
        details: { userMerchantId: 'mer-1', requestedMerchantId: 'mer-2' },
      });
    }
  });

  it('rejects a non-merchant non-admin role', () => {
    expect(() =>
      guard.canActivate(
        contextWith({
          user: { id: 'u1', role: 'USER' },
          params: { merchantId: 'mer-1' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
