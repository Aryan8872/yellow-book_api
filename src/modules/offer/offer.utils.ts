/**
 * Offer Module Utilities
 * Helper functions for offer operations
 */

import { Prisma } from '@prisma/client';
import { OFFER_SELECT_FIELDS } from './offer.constants';

/**
 * Maps Prisma offer entity to summary DTO
 *
 * @param offer - The Prisma offer entity
 * @returns The offer summary
 */
export function mapOfferToSummary(
  offer: Prisma.OfferGetPayload<{
    select: typeof OFFER_SELECT_FIELDS;
  }>,
) {
  return {
    id: offer.id,
    merchantId: offer.merchantId,
    merchantName: offer.merchant.name,
    title: offer.title,
    category: offer.category,
    description: offer.description,
    terms: offer.terms,
    estimatedSavingsNpr: Number(offer.estimatedSavingsNpr),
    maxPerUser: offer.maxPerUser,
    isActive: offer.isActive,
  };
}
