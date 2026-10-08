import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
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
}
