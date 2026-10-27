import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import {
  CreateReviewDto,
  UpdateReviewDto,
  QueryReviewsDto,
  CreateHelpfulVoteDto,
  CreateReviewReportDto,
  UpdateReviewStatusDto,
} from './dto/review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/auth.decorators';
import { UserRole } from '../auth/auth.types';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * Get all reviews with filtering and pagination
   */
  @Get()
  async getReviews(@Query() query: QueryReviewsDto) {
    return this.reviewService.getReviews(query);
  }

  /**
   * Get rating summary for an offer or merchant
   */
  @Get('summary')
  async getRatingSummary(@Query('offerId') offerId?: string, @Query('merchantId') merchantId?: string) {
    return this.reviewService.getRatingSummary(offerId, merchantId);
  }

  /**
   * Get review by ID
   */
  @Get(':id')
  async getReviewById(@Param('id') id: string) {
    return this.reviewService.getReviewById(id);
  }

  /**
   * Create a new review (authenticated)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createReview(@Request() req, @Body() dto: CreateReviewDto) {
    return this.reviewService.createReview(req.user.id, dto);
  }

  /**
   * Update a review (authenticated, owner only)
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateReview(@Request() req, @Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.reviewService.updateReview(id, req.user.id, dto);
  }

  /**
   * Delete a review (authenticated, owner only)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteReview(@Request() req, @Param('id') id: string) {
    return this.reviewService.deleteReview(id, req.user.id);
  }

  /**
   * Mark review as helpful (authenticated)
   */
  @Post(':id/helpful')
  @UseGuards(JwtAuthGuard)
  async markHelpful(@Request() req, @Param('id') id: string) {
    return this.reviewService.markHelpful(id, req.user.id);
  }

  /**
   * Remove helpful vote (authenticated)
   */
  @Delete(':id/helpful')
  @UseGuards(JwtAuthGuard)
  async removeHelpful(@Request() req, @Param('id') id: string) {
    return this.reviewService.removeHelpful(id, req.user.id);
  }

  /**
   * Report a review (authenticated)
   */
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  async reportReview(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateReviewReportDto,
  ) {
    return this.reviewService.reportReview(id, req.user.id, dto.reason, dto.comment);
  }

  /**
   * Update review status (admin/moderator only)
   */
  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateReviewStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewService.updateReviewStatus(id, dto.status, dto.moderationNote, req.user.id);
  }
}
