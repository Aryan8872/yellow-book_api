/**
 * Authentication Module Constants
 * Centralized configuration for authentication-related operations
 */

export const AUTH_CONSTANTS = {
  /**
   * Bcrypt hashing rounds for password hashing
   * Higher rounds = more secure but slower (10 is recommended for production)
   */
  BCRYPT_ROUNDS: 10,

  /**
   * JWT Access token expiry time in seconds
   * 3600 seconds = 1 hour
   */
  ACCESS_TOKEN_EXPIRY_SECONDS: 3600,

  /**
   * JWT Refresh token expiry time in seconds
   * 7 * 86400 = 7 days
   */
  REFRESH_TOKEN_EXPIRY_SECONDS: 7 * 86400,

  /**
   * Redis key pattern for storing refresh tokens
   */
  REFRESH_TOKEN_KEY_PREFIX: 'refresh_token:',

  /**
   * Default JWT secrets for development (should be overridden by environment variables)
   */
  DEFAULT_JWT_SECRET: 'dev-super-secret-jwt-key-32chars-min!',
  DEFAULT_REFRESH_SECRET: 'dev-refresh-secret-jwt-key-32chars!',
} as const;

/**
 * Prisma user selection fields for common queries
 * Reduces duplication across service methods
 */
export const USER_SELECT_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  isVerified: true,
  isActive: true,
  createdAt: true,
  subscription: {
    select: {
      status: true,
      endsAt: true,
    },
  },
  merchantStaff: {
    select: {
      merchantId: true,
    },
  },
} as const;

/**
 * Prisma user selection fields including password hash
 * Used for authentication validation
 */
export const USER_SELECT_WITH_PASSWORD = {
  ...USER_SELECT_FIELDS,
  passwordHash: true,
  deletedAt: true,
} as const;
