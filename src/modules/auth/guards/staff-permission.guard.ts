import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STAFF_PERMISSION_KEY } from '../auth.decorators';
import { UserRole } from '../auth.types';
import { AppErrorCode } from '../../../common/constants/error-codes';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { StaffPermission } from '../../../common/constants/staff-permissions';

/**
 * Enforces granular staff capabilities declared via `@RequireStaffPermission()`.
 *
 * Design decision: the staff JWT carries only `merchantId`/`role`/`sub` and
 * does NOT embed the permissions array. Rather than re-issuing tokens on every
 * permission change, this guard looks up the caller's `MerchantStaff` row by
 * `userId` (unique) at request time and reads `permissions` from the DB. This
 * keeps permission changes effective immediately without a token refresh.
 *
 * `UserRole.ADMIN` and `UserRole.MERCHANT_ADMIN` implicitly hold every staff
 * permission, so existing role-based flows are never broken by this guard.
 */
@Injectable()
export class StaffPermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      StaffPermission[]
    >(STAFF_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    // No granular permission declared -> nothing to enforce here.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.id) {
      throw new ForbiddenException({
        message: 'Access denied: authentication required',
        errorCode: AppErrorCode.UNAUTHORIZED,
      });
    }

    // Privileged roles bypass the granular check (documented decision above).
    if (user.role === UserRole.ADMIN || user.role === UserRole.MERCHANT_ADMIN) {
      return true;
    }

    const staff = await this.prisma.merchantStaff.findUnique({
      where: { userId: user.id },
      select: { isActive: true, permissions: true },
    });

    if (!staff || !staff.isActive) {
      throw new ForbiddenException({
        message: 'Access denied: caller is not an active staff member',
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
      });
    }

    const granted = staff.permissions ?? [];
    const hasAll = requiredPermissions.every((permission) =>
      granted.includes(permission),
    );

    if (!hasAll) {
      throw new ForbiddenException({
        message: `Access denied: Required staff permissions [${requiredPermissions.join(
          ', ',
        )}]`,
        errorCode: AppErrorCode.INSUFFICIENT_PERMISSIONS,
        details: {
          requiredPermissions,
        },
      });
    }

    return true;
  }
}
