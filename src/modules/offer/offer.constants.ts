/**
 * Offer Module Constants
 * Centralized configuration for offer-related operations
 */

/**
 * Prisma offer selection fields for comprehensive public offer queries.
 * Includes pricing, media, rating, branches, merchant profile, and category.
 */
export const OFFER_SELECT_FIELDS = {
  id: true,
  merchantId: true,
  categoryId: true,
  title: true,
  description: true,
  terms: true,
  estimatedSavingsNpr: true,
  originalPriceNpr: true,
  discountPercentage: true,
  coverImage: true,
  images: true,
  highlights: true,
  rating: true,
  reviewsCount: true,
  isActive: true,
  isFeatured: true,
  validFrom: true,
  validUntil: true,
  availabilityJson: true,
  createdAt: true,
  merchant: {
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      websiteUrl: true,
      contactEmail: true,
      contactPhone: true,
      branches: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          district: true,
          lat: true,
          lng: true,
        },
      },
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      iconUrl: true,
      imageUrl: true,
      color: true,
    },
  },
} as const;
