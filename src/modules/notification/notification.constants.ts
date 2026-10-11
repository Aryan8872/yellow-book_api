import { EMAIL_TOKEN_TTL } from '../../common/constants/email-tokens.constants';

/**
 * Notification module constants.
 */

export const NOTIFICATION_CONSTANTS = {
  ...EMAIL_TOKEN_TTL,

  /** Human-facing product name used in email copy. */
  PRODUCT_NAME: 'OfferNepal',
} as const;

