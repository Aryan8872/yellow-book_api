import { SetMetadata } from '@nestjs/common';
import { UserRole } from './auth.types';

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

export const API_KEY_PROTECTED_KEY = 'isApiKeyProtected';
/**
 * Requires a valid x-api-key header for machine-to-machine, partner, or webhook ingestion.
 */
export const RequireApiKey = () => SetMetadata(API_KEY_PROTECTED_KEY, true);
