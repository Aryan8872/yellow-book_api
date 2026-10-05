export const MERCHANT_CONSTANTS = {
  /**
   * PIN length in digits
   */
  PIN_LENGTH: 4,

  /**
   * PIN range (1000-9999 for 4-digit PIN)
   */
  PIN_MIN: 1000,
  PIN_MAX: 9999,

  /**
   * Bcrypt salt rounds for PIN hashing
   */
  PIN_SALT_ROUNDS: 10,
} as const;
