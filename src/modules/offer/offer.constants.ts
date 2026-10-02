/**
 * Offer Module Constants
 * Centralized configuration for offer-related operations
 */

/**
 * Prisma offer selection fields for common queries
 */
export const OFFER_SELECT_FIELDS = {
  id: true,
  merchantId: true,
  title: true,
  category: true,
  description: true,
  terms: true,
  estimatedSavingsNpr: true,
  maxPerUser: true,
  isActive: true,
  merchant: {
    select: { id: true, name: true },
  },
} as const;
