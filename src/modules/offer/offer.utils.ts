/**
 * Offer Module Utilities
 * Helper functions for offer operations
 */

import { Prisma } from '@prisma/client';
import { OFFER_SELECT_FIELDS } from './offer.constants';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Maps Prisma offer entity with merchant branches and rich metadata to summary DTO
 *
 * @param offer - The Prisma offer entity
 * @returns The offer summary DTO
 */
export function mapOfferToSummary(
  offer: Prisma.OfferGetPayload<{
    select: typeof OFFER_SELECT_FIELDS;
  }>,
) {
  return {
    id: offer.id,
    merchantId: offer.merchantId,
    categoryId: offer.categoryId,
    merchantName: offer.merchant.name,
    title: offer.title,
    category: {
      id: offer.category.id,
      name: offer.category.name,
      slug: offer.category.slug,
      iconUrl: offer.category.iconUrl,
      imageUrl: offer.category.imageUrl,
      color: offer.category.color,
    },
    description: offer.description,
    terms: offer.terms,
    estimatedSavingsNpr: Number(offer.estimatedSavingsNpr),
    originalPriceNpr: offer.originalPriceNpr != null ? Number(offer.originalPriceNpr) : null,
    discountPercentage: offer.discountPercentage,
    coverImage: offer.coverImage,
    images: offer.images || [],
    highlights: offer.highlights || [],
    rating: Number(offer.rating ?? 4.8),
    reviewsCount: offer.reviewsCount ?? 0,
    isActive: offer.isActive,
    isFeatured: offer.isFeatured,
    validFrom: offer.validFrom,
    validUntil: offer.validUntil,
    availabilityJson: offer.availabilityJson,
    createdAt: offer.createdAt,
    merchant: {
      id: offer.merchant.id,
      name: offer.merchant.name,
      description: offer.merchant.description,
      logoUrl: offer.merchant.logoUrl,
      coverUrl: offer.merchant.coverUrl,
      websiteUrl: offer.merchant.websiteUrl,
      contactEmail: offer.merchant.contactEmail,
      contactPhone: offer.merchant.contactPhone,
      branches: (offer.merchant.branches || []).map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        district: b.district,
        lat: Number(b.lat),
        lng: Number(b.lng),
      })),
    },
  };
}
