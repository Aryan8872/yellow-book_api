import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators';
import { LocationService } from './location.service';
import { LocationSearchDto, ReverseGeocodeDto } from './dto/location-search.dto';

const placeSchema = {
  type: 'object',
  properties: {
    formatted: { type: 'string' },
    name: { type: 'string' },
    district: { type: 'string', nullable: true },
    lat: { type: 'number' },
    lon: { type: 'number' },
    confidence: { type: 'number' },
  },
};

const localitySchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    lat: { type: 'number' },
    lon: { type: 'number' },
  },
};

@ApiTags('locations')
@Controller('locations')
@UseGuards(ThrottlerGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('search')
  @ApiOperation({ summary: 'Search Nepal places using Geoapify geocoding' })
  @ApiResponse({ status: 200, description: 'Place search results', schema: { type: 'array', items: placeSchema } })
  @ApiResponse({ status: 400, description: 'Invalid search query' })
  @ApiResponse({ status: 500, description: 'Failed to search locations' })
  async searchPlaces(@Query() dto: LocationSearchDto) {
    return this.locationService.searchPlaces(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('reverse')
  @ApiOperation({ summary: 'Reverse-geocode coordinates into up to 5 nearby localities' })
  @ApiResponse({ status: 200, description: 'Nearby localities', schema: { type: 'array', items: localitySchema } })
  @ApiResponse({ status: 400, description: 'Invalid coordinates' })
  @ApiResponse({ status: 500, description: 'Failed to reverse-geocode' })
  async reverse(@Query() dto: ReverseGeocodeDto) {
    return this.locationService.reverse(dto);
  }
}
