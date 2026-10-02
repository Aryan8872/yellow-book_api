/**
 * Authentication Module Utilities
 * Helper functions for authentication operations
 */

import { UserRole as PrismaUserRole } from '@prisma/client';
import { UserRole } from './auth.types';

/**
 * Maps Prisma UserRole enum values to our internal UserRole enum.
 * Prisma enums and NestJS role enums are kept separate for domain flexibility.
 *
 * @param prismaRole - The Prisma UserRole enum value
 * @returns The corresponding application UserRole enum value
 */
export function mapPrismaRoleToAppRole(prismaRole: PrismaUserRole): UserRole {
  const roleMap: Record<PrismaUserRole, UserRole> = {
    [PrismaUserRole.USER]: UserRole.USER,
    [PrismaUserRole.MERCHANT_STAFF]: UserRole.MERCHANT_STAFF,
    [PrismaUserRole.MERCHANT_ADMIN]: UserRole.MERCHANT_ADMIN,
    [PrismaUserRole.ADMIN]: UserRole.ADMIN,
  };
  return roleMap[prismaRole] ?? UserRole.USER;
}

/**
 * Normalizes email to lowercase for consistent storage and comparison
 *
 * @param email - The email address to normalize
 * @returns The lowercase email address
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Checks if a subscription is considered active
 * Active if status is ACTIVE or IN_GRACE_PERIOD
 *
 * @param status - The subscription status
 * @returns True if subscription is active
 */
export function isSubscriptionActive(status: string | null): boolean {
  return status === 'ACTIVE' || status === 'IN_GRACE_PERIOD';
}

/**
 * Generates a Redis key for storing refresh tokens
 *
 * @param userId - The user ID
 * @param prefix - Optional custom prefix (defaults to 'refresh_token:')
 * @returns The Redis key
 */
export function getRefreshTokenKey(
  userId: string,
  prefix: string = 'refresh_token:',
): string {
  return `${prefix}${userId}`;
}
