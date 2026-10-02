import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth.decorators';
import { UserRole } from '../auth.types';
import { AppErrorCode } from '../../../common/constants/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException({
        message: 'Access denied: User does not possess a recognized role',
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
      });
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException({
        message: `Access denied: Required roles [${requiredRoles.join(', ')}]`,
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
        details: {
          userRole: user.role,
          requiredRoles,
        },
      });
    }

    return true;
  }
}
