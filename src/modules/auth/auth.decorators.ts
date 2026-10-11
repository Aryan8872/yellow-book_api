import { SetMetadata } from '@nestjs/common';
import { UserRole } from './auth.types';
import { StaffPermission } from '../../common/constants/staff-permissions';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Marks an endpoint as public, bypassing JWT authentication.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/**
 * Requires one or more UserRole permissions to access the route.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const STAFF_PERMISSION_KEY = 'staffPermissions';
/**
 * Requires the authenticated staff member to hold every listed granular
 * permission (see `StaffPermission`). Enforced by `StaffPermissionGuard`,
 * which reads the permissions from the caller's `MerchantStaff` row.
 *
 * NOTE: `UserRole.ADMIN` and `UserRole.MERCHANT_ADMIN` implicitly satisfy any
 * permission requirement, so this never breaks the existing role-based logic.
 */
export const RequireStaffPermission = (
  ...permissions: StaffPermission[]
) => SetMetadata(STAFF_PERMISSION_KEY, permissions);

export const API_KEY_PROTECTED_KEY = 'isApiKeyProtected';
/**
 * Requires a valid x-api-key header for machine-to-machine, partner, or webhook ingestion.
 */
export const RequireApiKey = () => SetMetadata(API_KEY_PROTECTED_KEY, true);
