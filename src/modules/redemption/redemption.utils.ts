/**
 * Redemption Module Utilities
 * Helper functions for redemption operations
 */

import { REDEMPTION_CONSTANTS } from './redemption.constants';

/**
 * Generates a unique redemption code
 * Format: NF-XXXXXX (where X is an alphanumeric character excluding ambiguous ones)
 *
 * @returns A unique redemption code
 */
export function generateRedemptionCode(): string {
  const { CODE_PREFIX, CODE_CHARS, CODE_RANDOM_LENGTH } = REDEMPTION_CONSTANTS;
  let code = CODE_PREFIX;
  
  for (let i = 0; i < CODE_RANDOM_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CODE_CHARS.length);
    code += CODE_CHARS.charAt(randomIndex);
  }
  
  return code;
}

/**
 * Calculates remaining seconds until expiration
 *
 * @param expiresAt - The expiration timestamp
 * @returns Remaining seconds (0 if already expired)
 */
export function calculateRemainingSeconds(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

/**
 * Generates a QR payload for redemption
 *
 * @param code - The redemption code
 * @returns The QR payload string
 */
export function generateQrPayload(code: string): string {
  return `offernepal://redeem?code=${code}`;
}

/**
 * Generates a distributed lock key for redemption
 *
 * @param sessionId - The redemption session ID
 * @returns The lock key
 */
export function getRedemptionLockKey(sessionId: string): string {
  return `${REDEMPTION_CONSTANTS.LOCK_KEY_PREFIX}${sessionId}`;
}
