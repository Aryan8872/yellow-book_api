import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import {
  QueryOffersDto,
  CreateOfferDto,
  UpdateOfferDto,
} from './dto/offer.dto';
import { OFFER_SELECT_FIELDS } from './offer.constants';
import { mapOfferToSummary, haversineDistance } from './offer.utils';

// ─── Return types returned to mobile & web clients ──────────────────────────

export interface MerchantBranchSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export interface MerchantDetailSummary {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  branches: MerchantBranchSummary[];
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  imageUrl: string | null;
  color: string | null;
}

export interface OfferSummary {
  id: string;
  merchantId: string;
  categoryId: string;
  merchantName: string;
  title: string;
  category: CategorySummary;
  description: string;
  terms: string;
  estimatedSavingsNpr: number;
  originalPriceNpr: number | null;
  discountedPriceNpr: number | null;
  discountPercentage: number | null;
  imageUrl: string | null;
  images: string[];
  highlights: string[];
  rating: number;
  reviewsCount: number;
  maxPerUser: number;
  isActive: boolean;
  isFeatured: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  availabilityJson: any;
  createdAt: Date;
  merchant: MerchantDetailSummary;
}

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Get paginated list of offers with filtering and sorting
   */
  async getOffers(
    query: QueryOffersDto,
  ): Promise<{ offers: OfferSummary[]; count: number; total: number }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    const locationTerm = (query.location || query.city)?.trim();

    const where: Prisma.OfferWhereInput = {
      isActive: true,
      ...(query.merchantId && { merchantId: query.merchantId }),
      ...(query.category && {
        OR: [
          { categoryId: query.category },
          { category: { slug: { equals: query.category.toLowerCase(), mode: 'insensitive' } } },
          { category: { name: { equals: query.category, mode: 'insensitive' } } },
        ],
      }),
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          { merchant: { name: { contains: query.q, mode: 'insensitive' } } },
          {
            merchant: {
              branches: {
                some: {
                  OR: [
                    { name: { contains: query.q, mode: 'insensitive' } },
                    { city: { contains: query.q, mode: 'insensitive' } },
                    { address: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      }),
      ...(locationTerm && {
        merchant: {
          branches: {
            some: {
              isActive: true,
              OR: [
                { city: { contains: locationTerm, mode: 'insensitive' } },
                { address: { contains: locationTerm, mode: 'insensitive' } },
                { name: { contains: locationTerm, mode: 'insensitive' } },
              ],
            },
          },
        },
      }),
    };

    // Determine sorting based on query parameter
    let orderBy: Prisma.OfferOrderByWithRelationInput[];
    switch (query.sortBy) {
      case 'trending':
        orderBy = [{ isFeatured: 'desc' }, { trendingScore: 'desc' }, { viewCount: 'desc' }];
        break;
      case 'popular':
        orderBy = [{ isFeatured: 'desc' }, { redemptionCount: 'desc' }, { rating: 'desc' }];
        break;
      case 'rating':
        orderBy = [{ isFeatured: 'desc' }, { rating: 'desc' }, { reviewsCount: 'desc' }];
        break;
      case 'savings':
        orderBy = [{ isFeatured: 'desc' }, { estimatedSavingsNpr: 'desc' }];
        break;
      default:
        orderBy = [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
    }

    const [offers, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        select: OFFER_SELECT_FIELDS,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.offer.count({ where }),
    ]);

    // Apply location filtering if coordinates and radius provided
    let filteredOffers = offers;
    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      filteredOffers = offers.filter((offer) => {
        return offer.merchant.branches.some((branch) => {
          const distance = haversineDistance(
            query.lat!,
            query.lng!,
            Number(branch.lat),
            Number(branch.lng),
          );
          return distance <= query.radiusKm!;
        });
      });
    }

    return {
      offers: filteredOffers.map(mapOfferToSummary),
      count: filteredOffers.length,
      total,
    };
  }

  /**
   * Get home page data with featured, trending, and popular offers
   * Optimized single query for mobile home screen
   */
  async getHomeData(): Promise<{
    featured: OfferSummary[];
    trending: OfferSummary[];
    popular: OfferSummary[];
  }> {
    const [featured, trending, popular] = await this.prisma.$transaction([
      // Featured offers (isFeatured: true, limited to 10)
      this.prisma.offer.findMany({
        where: { isActive: true, isFeatured: true },
        select: OFFER_SELECT_FIELDS,
        take: 10,
        orderBy: [{ createdAt: 'desc' }],
      }),
      // Trending offers (by trending score, limited to 10)
      this.prisma.offer.findMany({
        where: { isActive: true },
        select: OFFER_SELECT_FIELDS,
        take: 10,
        orderBy: [{ trendingScore: 'desc' }, { viewCount: 'desc' }],
      }),
      // Popular offers (by redemption count, limited to 10)
      this.prisma.offer.findMany({
        where: { isActive: true },
        select: OFFER_SELECT_FIELDS,
        take: 10,
        orderBy: [{ redemptionCount: 'desc' }, { rating: 'desc' }],
      }),
    ]);

    return {
      featured: featured.map(mapOfferToSummary),
      trending: trending.map(mapOfferToSummary),
      popular: popular.map(mapOfferToSummary),
    };
  }

  /**
   * Get offer details by ID
   */
  async getOfferById(id: string): Promise<OfferSummary> {
    const offer = await this.prisma.offer.findFirst({
      where: { id, isActive: true },
      select: OFFER_SELECT_FIELDS,
    });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    return mapOfferToSummary(offer);
  }

  /**
   * Increment offer view count for trending calculation
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.prisma.offer.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        // Update trending score: (views * 0.3) + (redemptions * 0.7)
        trendingScore: {
          increment: 0.3,
        },
      },
    });
  }

  /**
   * Increment offer redemption count for popularity calculation
   */
  async incrementRedemptionCount(id: string): Promise<void> {
    await this.prisma.offer.update({
      where: { id },
      data: {
        redemptionCount: { increment: 1 },
        // Update trending score: (views * 0.3) + (redemptions * 0.7)
        trendingScore: {
          increment: 0.7,
        },
      },
    });
  }

  /**
   * Create a new offer for a merchant
   */
  async createOffer(
    merchantId: string,
    dto: CreateOfferDto,
  ): Promise<OfferSummary> {
    // Verify merchant exists and is active
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, status: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Merchant account must be active to create offers',
      );
    }

    const offer = await this.prisma.offer.create({
      data: {
        merchantId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        terms: dto.terms,
        estimatedSavingsNpr: dto.estimatedSavingsNpr,
        originalPriceNpr: dto.originalPriceNpr,
        discountedPriceNpr: dto.discountedPriceNpr,
        discountPercentage: dto.discountPercentage,
        imageUrl: dto.imageUrl,
        images: dto.images ?? [],
        highlights: dto.highlights ?? [],
        maxPerUser: dto.maxPerUser,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        availabilityJson: dto.availabilityJson,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
      },
      select: OFFER_SELECT_FIELDS,
    });

    this.metrics.offersCreated.inc({ merchant_id: merchantId });

    return mapOfferToSummary(offer);
  }

  /**
   * Update an existing offer
   */
  async updateOffer(
    offerId: string,
    merchantId: string,
    dto: UpdateOfferDto,
  ): Promise<OfferSummary> {
    // Verify offer belongs to merchant
    const existingOffer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, merchantId: true },
    });

    if (!existingOffer) {
      throw new NotFoundException('Offer not found');
    }

    if (existingOffer.merchantId !== merchantId) {
      throw new ForbiddenException(
        'You can only update offers belonging to your merchant',
      );
    }

    const offer = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.terms !== undefined && { terms: dto.terms }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.estimatedSavingsNpr !== undefined && { estimatedSavingsNpr: dto.estimatedSavingsNpr }),
        ...(dto.originalPriceNpr !== undefined && { originalPriceNpr: dto.originalPriceNpr }),
        ...(dto.discountedPriceNpr !== undefined && { discountedPriceNpr: dto.discountedPriceNpr }),
        ...(dto.discountPercentage !== undefined && { discountPercentage: dto.discountPercentage }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.images !== undefined && { images: dto.images }),
        ...(dto.highlights !== undefined && { highlights: dto.highlights }),
        ...(dto.maxPerUser !== undefined && { maxPerUser: dto.maxPerUser }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.availabilityJson !== undefined && { availabilityJson: dto.availabilityJson }),
        ...(dto.validFrom !== undefined && { validFrom: dto.validFrom ? new Date(dto.validFrom) : null }),
        ...(dto.validUntil !== undefined && { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }),
      },
      select: OFFER_SELECT_FIELDS,
    });

    return mapOfferToSummary(offer);
  }

  /**
   * Delete an offer
   */
  async deleteOffer(offerId: string, merchantId: string): Promise<void> {
    // Verify offer belongs to merchant
    const existingOffer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, merchantId: true },
    });

    if (!existingOffer) {
      throw new NotFoundException('Offer not found');
    }

    if (existingOffer.merchantId !== merchantId) {
      throw new ForbiddenException(
        'You can only delete offers belonging to your merchant',
      );
    }

    await this.prisma.offer.delete({
      where: { id: offerId },
    });

    this.metrics.offersCreated.inc({ merchant_id: merchantId, status: 'DELETED' });
  }
}
