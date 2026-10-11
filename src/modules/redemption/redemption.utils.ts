/**
 * Redemption Module Utilities
 * Helper functions for redemption operations
 */

import * as QRCode from 'qrcode';
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
 * QR PAYLOAD FORMAT (documented after reading generateQrPayload):
 *   `offernepal://redeem?code=NF-XXXXXX`
 * The payload is a plain deep-link that carries ONLY the redemption code as a
 * `code` query parameter. There is NO signature / HMAC in the payload, so
 * verification is by looking up the code in the `RedemptionSession` table
 * (which is authoritative) rather than by validating a signature. This function
 * is the exact inverse of `generateQrPayload`.
 *
 * For resilience it also accepts a bare code (e.g. "NF-7821AB") and normalises
 * the result to upper-case to match `merchantRedeem`'s code handling.
 *
 * @param qrPayload - The scanned QR payload (or bare code)
 * @returns The normalised redemption code
 */
export function extractRedemptionCode(qrPayload: string): string {
  const trimmed = (qrPayload ?? '').trim();
  if (!trimmed) {
    throw new Error('Empty QR payload');
  }

  const match = trimmed.match(/[?&]code=([^&\s]+)/i);
  if (match) {
    return decodeURIComponent(match[1]).toUpperCase();
  }

  // Fallback: treat the whole payload as a bare code.
  return trimmed.toUpperCase();
}

/**
 * Renders a QR payload string into a scannable PNG data URL using the `qrcode`
 * library. qrcode@1.5.4 ships a CommonJS build (`main: ./lib/index.js`, no
 * `"type": "module"`), so this static import compiles to `require('qrcode')`
 * and works under both the NestJS CommonJS runtime and ts-jest (mockable).
 *
 * @param payload - The string to encode (typically the output of generateQrPayload)
 * @returns A base64 PNG data URL, e.g. `data:image/png;base64,...`
 */
export async function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
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
