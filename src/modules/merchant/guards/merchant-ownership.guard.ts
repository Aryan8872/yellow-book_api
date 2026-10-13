import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppErrorCode } from '../../../common/constants/error-codes';

@Injectable()
export class MerchantOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        message: 'Authentication required',
        errorCode: AppErrorCode.UNAUTHORIZED,
      });
    }

    // Extract merchantId from params or body
    const merchantId = request.params.merchantId || request.params.id || request.body.merchantId;

    // Admins can access any merchant
    if (user.role === UserRole.ADMIN) return true;

    // Merchant users can only access their own merchant
    if (user.role === UserRole.MERCHANT_ADMIN || user.role === UserRole.MERCHANT_STAFF) {
      if (!user.merchantId) {
        throw new ForbiddenException({
          message: 'Merchant account not associated with a merchant',
          errorCode: AppErrorCode.FORBIDDEN,
        });
      }

      if (user.merchantId === merchantId) return true;

      throw new ForbiddenException({
        message: 'Access denied: You can only access your own merchant data',
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
        details: {
          userMerchantId: user.merchantId,
          requestedMerchantId: merchantId,
        },
      });
    }

    throw new ForbiddenException({
      message: 'Access denied: Insufficient permissions',
      errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  }
}
