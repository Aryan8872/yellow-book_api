/**
 * Authentication Module Utilities
 * Helper functions for authentication operations
 */

import * as crypto from 'crypto';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { UserRole } from './auth.types';
import {
  PASSWORD_RESET_TTL_MS,
  EMAIL_VERIFICATION_TTL_MS,
} from '../../common/constants/email-tokens.constants';

/**
 * Maps Prisma UserRole enum values to our internal UserRole enum.
 * Prisma enums and NestJS role enums are kept separate for domain flexibility.
 *
 * @param prismaRole - The Prisma UserRole enum value or string
 * @returns The corresponding application UserRole enum value
 */
export function mapPrismaRoleToAppRole(prismaRole: PrismaUserRole | string): UserRole {
  const roleMap: Record<string, UserRole> = {
    'USER': UserRole.USER,
    'MERCHANT_STAFF': UserRole.MERCHANT_STAFF,
    'MERCHANT_ADMIN': UserRole.MERCHANT_ADMIN,
    'ADMIN': UserRole.ADMIN,
  };
  return roleMap[prismaRole as string] ?? UserRole.USER;
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

/**
 * Generates a URL-safe, single-use token (256 bits of entropy).
 *
 * The raw value is what gets emailed; only its hash is ever persisted.
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a single-use email token for at-rest storage (T-02-02).
 *
 * SHA-256 is used rather than bcrypt deliberately: these tokens carry 256 bits
 * of CSPRNG entropy, so there is no dictionary/brute-force surface to slow down,
 * and the lookup has to be an exact-match index probe on every reset attempt.
 */
export function hashSecureToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Expiry timestamp for a freshly minted password-reset token. */
export function passwordResetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
}

/** Expiry timestamp for a freshly minted email-verification token. */
export function emailVerificationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
}

