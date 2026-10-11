/**
 * Shared lifetimes for email-borne, single-use tokens (T-02-02).
 *
 * These live outside both the auth and notification modules because the same
 * numbers are needed in two places: when a token is minted and persisted (auth
 * service, sets the DB expiry column) and when the expiry is stated in the
 * email copy (notifications service).
 */

export const EMAIL_TOKEN_TTL = {
  /** Password-reset tokens are short-lived: 15 minutes. */
  PASSWORD_RESET_MINUTES: 15,

  /** Email-verification tokens: 24 hours. */
  EMAIL_VERIFICATION_HOURS: 24,
} as const;

export const PASSWORD_RESET_TTL_MS =
  EMAIL_TOKEN_TTL.PASSWORD_RESET_MINUTES * 60 * 1000;

export const EMAIL_VERIFICATION_TTL_MS =
  EMAIL_TOKEN_TTL.EMAIL_VERIFICATION_HOURS * 60 * 60 * 1000;
