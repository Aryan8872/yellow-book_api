import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppErrorCode } from '../../../common/constants/error-codes';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        message: 'Authentication required',
        errorCode: AppErrorCode.UNAUTHORIZED,
      });
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        message: 'Admin access required',
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
        details: {
          userRole: user.role,
          requiredRole: UserRole.ADMIN,
        },
      });
    }

    return true;
  }
}
