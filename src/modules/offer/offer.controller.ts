import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { OfferService, OfferSummary } from './offer.service';
import {
  QueryOffersDto,
  CreateOfferDto,
  UpdateOfferDto,
} from './dto/offer.dto';
import { Public, Roles } from '../auth/auth.decorators';
import { UserRole } from '../auth/auth.types';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Offers')
@Controller('offers')
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Public()
  @Get('home')
  @ApiOperation({ summary: 'Get home page data (featured, trending, popular offers)' })
  @ApiOkResponse({
    description: 'Home page data with featured, trending, and popular offers',
  })
  async getHomeData() {
    return this.offerService.getHomeData();
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Discover deals and offers (public catalog)' })
  @ApiOkResponse({
    description: 'List of offers with pagination metadata',
    schema: {
      type: 'object',
      properties: {
        offers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'clx123abc' },
              merchantId: { type: 'string', example: 'clx456def' },
              merchantName: { type: 'string', example: 'Burger House' },
              title: { type: 'string', example: '50% Off on All Burgers' },
              category: { type: 'string', example: 'DINING' },
              description: { type: 'string', example: 'Get 50% discount on all burger items. Valid for dine-in only.' },
              terms: { type: 'string', example: 'Cannot be combined with other offers. Valid for dine-in only.' },
              estimatedSavingsNpr: { type: 'number', example: 250 },
              maxPerUser: { type: 'number', example: 3 },
              isActive: { type: 'boolean', example: true },
            },
          },
        },
        count: { type: 'number', example: 20, description: 'Number of offers in current page' },
        total: { type: 'number', example: 100, description: 'Total number of offers matching query' },
      },
    },
  })
  async getOffers(@Query() query: QueryOffersDto) {
    return this.offerService.getOffers(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get offer details by ID (public)' })
  @ApiOkResponse({ description: 'Offer details' })
  async getOfferById(@Param('id') id: string): Promise<OfferSummary> {
    return this.offerService.getOfferById(id);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track offer view (increment view count)' })
  @ApiResponse({ status: 200, description: 'View count incremented' })
  async trackOfferView(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.offerService.incrementViewCount(id);
    return { success: true };
  }

  @Public()
  @Post(':id/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track offer redemption (increment redemption count)' })
  @ApiResponse({ status: 200, description: 'Redemption count incremented' })
  async trackOfferRedemption(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.offerService.incrementRedemptionCount(id);
    return { success: true };
  }

  @Post('merchants/:merchantId/offers')
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.MERCHANT_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new offer for a merchant' })
  @ApiResponse({ status: 201, description: 'Offer created successfully' })
  @ApiResponse({ status: 403, description: 'Merchant account not active' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createOffer(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Verify user belongs to the merchant or is admin
    if (user.role !== UserRole.ADMIN && user.merchantId !== merchantId) {
      throw new ForbiddenException(
        'You can only create offers for your own merchant',
      );
    }
    return this.offerService.createOffer(merchantId, dto);
  }

  @Patch('merchants/:merchantId/offers/:offerId')
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.MERCHANT_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update an existing offer' })
  @ApiResponse({ status: 200, description: 'Offer updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async updateOffer(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Verify user belongs to the merchant or is admin
    if (user.role !== UserRole.ADMIN && user.merchantId !== merchantId) {
      throw new ForbiddenException(
        'You can only update offers for your own merchant',
      );
    }
    return this.offerService.updateOffer(offerId, merchantId, dto);
  }

  @Delete('merchants/:merchantId/offers/:offerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.MERCHANT_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete an offer' })
  @ApiResponse({ status: 204, description: 'Offer deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async deleteOffer(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Verify user belongs to the merchant or is admin
    if (user.role !== UserRole.ADMIN && user.merchantId !== merchantId) {
      throw new ForbiddenException(
        'You can only delete offers for your own merchant',
      );
    }
    return this.offerService.deleteOffer(offerId, merchantId);
  }
}
