import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LocationService } from './location.service';
import { LocationSearchDto, LocationResultDto } from './dto/location-search.dto';

@ApiTags('locations')
@Controller('locations')
@UseGuards(ThrottlerGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for locations using Geoapify geocoding' })
  @ApiResponse({ status: 200, description: 'Location search results', type: [LocationResultDto] })
  @ApiResponse({ status: 400, description: 'Invalid search query' })
  @ApiResponse({ status: 500, description: 'Failed to search locations' })
  async searchLocations(@Query() dto: LocationSearchDto): Promise<LocationResultDto[]> {
    return this.locationService.searchLocations(dto);
  }
}
