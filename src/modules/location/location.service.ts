import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { LocationSearchDto, LocationResultDto } from './dto/location-search.dto';

@Injectable()
export class LocationService {
  private readonly geoapifyApiKey: string;
  private readonly geoapifyBaseUrl = 'https://api.geoapify.com/v1/geocode';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.geoapifyApiKey = this.configService.get<string>('GEOAPIFY_GEOCODING_KEY') || '';
    if (!this.geoapifyApiKey) {
      throw new Error('GEOAPIFY_GEOCODING_KEY is not configured');
    }
  }

  /**
   * Search for locations using Geoapify geocoding API
   * @param dto Location search query
   * @returns Array of location results
   */
  async searchLocations(dto: LocationSearchDto): Promise<LocationResultDto[]> {
    try {
      const url = `${this.geoapifyBaseUrl}/autocomplete`;
      const params = {
        text: dto.query,
        apiKey: this.geoapifyApiKey,
        limit: '5',
        lang: 'en',
        format: 'json',
      };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }).pipe(
          map((axiosResponse) => axiosResponse.data),
        ),
      );

      if (!response.features || response.features.length === 0) {
        return [];
      }

      return response.features.map((feature: any) => ({
        formattedAddress: feature.properties.formatted || feature.properties.name || '',
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        city: feature.properties.city,
        country: feature.properties.country_code,
      }));
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          `Geoapify API error: ${error.response.data?.message || error.message}`,
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        'Failed to search locations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
