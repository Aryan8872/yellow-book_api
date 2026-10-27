import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateReviewDto, UpdateReviewDto, QueryReviewsDto, ReviewStatus } from './dto/review.dto';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get reviews with filtering and pagination
   */
  async getReviews(query: QueryReviewsDto) {
    const { offerId, merchantId, rating, status, isVerified, isFeatured, sortBy, page = 1, limit = 20 } = query;

    const where: Prisma.ReviewWhereInput = {
      ...(offerId && { offerId }),
      ...(merchantId && { merchantId }),
      ...(rating !== undefined && { rating }),
      ...(status && { status }),
      ...(isVerified !== undefined && { isVerified }),
      ...(isFeatured !== undefined && { isFeatured }),
      status: status || ReviewStatus.PUBLISHED, // Default to published reviews
    };

    // Determine sort order
    let orderBy: Prisma.ReviewOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'helpful') {
      orderBy = { helpfulCount: 'desc' };
    } else if (sortBy === 'rating_high') {
      orderBy = { rating: 'desc' };
    } else if (sortBy === 'rating_low') {
      orderBy = { rating: 'asc' };
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          offer: {
            select: {
              id: true,
              title: true,
            },
          },
          merchant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get review by ID
   */
  async getReviewById(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        offer: {
          select: {
            id: true,
            title: true,
          },
        },
        merchant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return review;
  }

  /**
   * Create a new review
   */
  async createReview(userId: string, dto: CreateReviewDto) {
    const { offerId, merchantId, rating, title, comment, photos } = dto;

    // Validate that either offerId or merchantId is provided
    if (!offerId && !merchantId) {
      throw new BadRequestException('Either offerId or merchantId must be provided');
    }

    // Check if user already reviewed this offer/merchant
    const existingReview = await this.prisma.review.findFirst({
      where: {
        userId,
        ...(offerId && { offerId }),
        ...(merchantId && { merchantId }),
      },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this item');
    }

    // Check if offer/merchant exists
    if (offerId) {
      const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
      if (!offer) {
        throw new NotFoundException('Offer not found');
      }
    }

    if (merchantId) {
      const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }
    }

    // Check if user has a verified redemption for this offer (for isVerified flag)
    let isVerified = false;
    if (offerId) {
      const redemption = await this.prisma.redemptionSession.findFirst({
        where: {
          userId,
          offerId,
          status: 'REDEEMED',
        },
      });
      isVerified = !!redemption;
    }

    const review = await this.prisma.review.create({
      data: {
        userId,
        offerId,
        merchantId,
        rating,
        title,
        comment,
        photos: photos || [],
        isVerified,
        status: ReviewStatus.PUBLISHED, // Auto-publish for now, can be changed to PENDING for moderation
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update offer/merchant rating cache
    await this.updateRatingCache(offerId, merchantId);

    this.logger.log(`Review created by user ${userId} for ${offerId ? 'offer' : 'merchant'} ${offerId || merchantId}`);
    return review;
  }

  /**
   * Update a review
   */
  async updateReview(id: string, userId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    // Check ownership
    if (review.userId !== userId) {
      throw new BadRequestException('You can only update your own reviews');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.comment !== undefined && { comment: dto.comment }),
        ...(dto.photos !== undefined && { photos: dto.photos }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update rating cache
    await this.updateRatingCache(review.offerId || undefined, review.merchantId || undefined);

    return updated;
  }

  /**
   * Delete a review
   */
  async deleteReview(id: string, userId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    // Check ownership (admin can delete any review - add admin check later)
    if (review.userId !== userId) {
      throw new BadRequestException('You can only delete your own reviews');
    }

    await this.prisma.review.delete({
      where: { id },
    });

    // Update rating cache
    await this.updateRatingCache(review.offerId || undefined, review.merchantId || undefined);

    this.logger.log(`Review ${id} deleted by user ${userId}`);
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId: string, userId: string) {
    // Check if user already voted
    const existingVote = await this.prisma.reviewHelpfulVote.findUnique({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

    if (existingVote) {
      throw new BadRequestException('You have already marked this review as helpful');
    }

    await this.prisma.reviewHelpfulVote.create({
      data: {
        reviewId,
        userId,
      },
    });

    // Increment helpful count
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        helpfulCount: {
          increment: 1,
        },
      },
    });

    return review;
  }

  /**
   * Remove helpful vote
   */
  async removeHelpful(reviewId: string, userId: string) {
    const vote = await this.prisma.reviewHelpfulVote.findUnique({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

    if (!vote) {
      throw new BadRequestException('You have not marked this review as helpful');
    }

    await this.prisma.reviewHelpfulVote.delete({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

    // Decrement helpful count
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        helpfulCount: {
          decrement: 1,
        },
      },
    });

    return review;
  }

  /**
   * Report a review
   */
  async reportReview(reviewId: string, userId: string, reason: string, comment?: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Check if user already reported this review
    const existingReport = await this.prisma.reviewReport.findFirst({
      where: {
        reviewId,
        userId,
        status: 'PENDING',
      },
    });

    if (existingReport) {
      throw new BadRequestException('You have already reported this review');
    }

    const report = await this.prisma.reviewReport.create({
      data: {
        reviewId,
        userId,
        reason,
        comment,
      },
    });

    // Increment report count on review
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        reportCount: {
          increment: 1,
        },
      },
    });

    // Auto-hide if too many reports (spam protection)
    if (review.reportCount + 1 >= 5) {
      await this.prisma.review.update({
        where: { id: reviewId },
        data: {
          status: ReviewStatus.HIDDEN,
        },
      });
    }

    return report;
  }

  /**
   * Update review status (admin/moderator only)
   */
  async updateReviewStatus(id: string, status: ReviewStatus, moderationNote?: string, moderatorId?: string) {
    const review = await this.prisma.review.update({
      where: { id },
      data: {
        status,
        moderationNote,
        moderatedAt: new Date(),
        moderatedBy: moderatorId,
      },
    });

    return review;
  }

  /**
   * Update rating cache for offer/merchant
   * This should be called after review creation, update, or deletion
   */
  private async updateRatingCache(offerId?: string, merchantId?: string) {
    if (offerId) {
      const reviews = await this.prisma.review.findMany({
        where: {
          offerId,
          status: ReviewStatus.PUBLISHED,
        },
        select: {
          rating: true,
        },
      });

      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

      await this.prisma.offer.update({
        where: { id: offerId },
        data: {
          rating: avgRating,
          reviewsCount: reviews.length,
        },
      });
    }

    if (merchantId) {
      const reviews = await this.prisma.review.findMany({
        where: {
          merchantId,
          status: ReviewStatus.PUBLISHED,
        },
        select: {
          rating: true,
        },
      });

      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

      // Add rating field to Merchant model if not exists
      // For now, we'll store it in a separate cache or add field later
      this.logger.log(`Merchant ${merchantId} rating updated to ${avgRating} (${reviews.length} reviews)`);
    }
  }

  /**
   * Get rating summary for an offer or merchant
   */
  async getRatingSummary(offerId?: string, merchantId?: string) {
    if (!offerId && !merchantId) {
      throw new BadRequestException('Either offerId or merchantId must be provided');
    }

    const reviews = await this.prisma.review.findMany({
      where: {
        ...(offerId && { offerId }),
        ...(merchantId && { merchantId }),
        status: ReviewStatus.PUBLISHED,
      },
      select: {
        rating: true,
      },
    });

    const total = reviews.length;
    const average = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    // Distribution by rating
    const distribution = {
      5: reviews.filter(r => r.rating === 5).length,
      4: reviews.filter(r => r.rating === 4).length,
      3: reviews.filter(r => r.rating === 3).length,
      2: reviews.filter(r => r.rating === 2).length,
      1: reviews.filter(r => r.rating === 1).length,
    };

    return {
      average,
      total,
      distribution,
    };
  }
}
