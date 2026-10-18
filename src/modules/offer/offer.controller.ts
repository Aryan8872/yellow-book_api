import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { OfferService, OfferSummary } from './offer.service';
import { QueryOffersDto } from './dto/offer.dto';
import { Public } from '../auth/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('favourites')
  @ApiOperation({ summary: 'Get authenticated user\'s saved/favourite offers' })
  @ApiOkResponse({ description: 'Paginated list of favourite offers' })
  async getFavourites(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.offerService.getFavourites(userId, Number(page), Number(limit));
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/favourite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle offer favourite (save/unsave)' })
  @ApiResponse({ status: 200, description: 'Favourite toggled', schema: { type: 'object', properties: { isFavourite: { type: 'boolean' } } } })
  async toggleFavourite(
    @Param('id') offerId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ isFavourite: boolean }> {
    return this.offerService.toggleFavourite(userId, offerId);
  }
}

