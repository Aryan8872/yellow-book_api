/**
 * Redemption Module Constants
 * Centralized configuration for redemption-related operations
 */

export const REDEMPTION_CONSTANTS = {
  /**
   * Redemption code TTL in seconds
   * 86400 seconds = 1 day (changed from 180s for travel time)
   */
  CODE_TTL_SECONDS: 86400,

  /**
   * Characters allowed in redemption codes
   * Excludes ambiguous characters (0, O, 1, I)
   */
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',

  /**
   * Length of the random portion of the redemption code
   */
  CODE_RANDOM_LENGTH: 6,

  /**
   * Prefix for redemption codes
   */
  CODE_PREFIX: 'NF-',

  /**
   * Distributed lock TTL in milliseconds
   * 5000ms = 5 seconds
   */
  LOCK_TTL_MS: 5000,

  /**
   * Distributed lock key pattern
   */
  LOCK_KEY_PREFIX: 'redemption:',
} as const;
