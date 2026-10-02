import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, OfferCategory } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import {
  QueryOffersDto,
  CreateOfferDto,
  UpdateOfferDto,
} from './dto/offer.dto';
import { OFFER_SELECT_FIELDS } from './offer.constants';
import { mapOfferToSummary } from './offer.utils';

// ─── Lean return types (no circular Prisma includes) ────────────────────────

export interface OfferSummary {
  id: string;
  merchantId: string;
  merchantName: string;
  title: string;
  category: string;
  description: string;
  terms: string;
  estimatedSavingsNpr: number;
  maxPerUser: number;
  isActive: boolean;
}

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Get paginated list of offers with filtering
   */
  async getOffers(
    query: QueryOffersDto,
  ): Promise<{ offers: OfferSummary[]; count: number; total: number }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100); // cap at 100
    const skip = (page - 1) * limit;

    const where: Prisma.OfferWhereInput = {
      isActive: true,
      ...(query.category && { category: query.category as OfferCategory }),
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { merchant: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };

    const [offers, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        select: OFFER_SELECT_FIELDS,
        skip,
        take: limit,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      offers: offers.map(mapOfferToSummary),
      count: offers.length,
      total,
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
        title: dto.title,
        description: dto.description,
        terms: dto.terms,
        category: dto.category as OfferCategory,
        estimatedSavingsNpr: dto.estimatedSavingsNpr,
        maxPerUser: dto.maxPerUser,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        availabilityJson: dto.availabilityJson,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
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
        ...(dto.category !== undefined && { category: dto.category as OfferCategory }),
        ...(dto.estimatedSavingsNpr !== undefined && { estimatedSavingsNpr: dto.estimatedSavingsNpr }),
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
