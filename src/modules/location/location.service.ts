import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { LocationSearchDto } from './dto/location-search.dto';

export interface LocationPlaceResult {
  formatted: string;
  name: string;
  district?: string;
  lat: number;
  lon: number;
  confidence: number;
}

export interface LocationReverseResult {
  name: string;
  lat: number;
  lon: number;
}

interface ReverseGeocodeParams {
  lat: number;
  lon: number;
}

/** Lifecycle entry for the in-memory TTL cache. */
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 300000; // 5 min
const CACHE_MAX_ENTRIES = 500;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly geoapifyApiKey: string;
  private readonly geoapifyBaseUrl = 'https://api.geoapify.com/v1/geocode';
  private readonly cache = new Map<string, CacheEntry>();

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
   * Search for places using Geoapify geocoding autocomplete.
   * Nepal-filtered; optionally proximity-biased when lat/lon are supplied.
   * @param dto Location search query
   * @returns Array of place results
   */
  async searchPlaces(
    dto: { query: string; lat?: number; lon?: number; limit?: number },
  ): Promise<LocationPlaceResult[]> {
    const params: Record<string, unknown> = {
      text: dto.query,
      filter: 'countrycode:np',
      lang: 'en',
      apiKey: this.geoapifyApiKey,
      limit: dto.limit ?? 5,
    };
    // Proximity bias from validated numbers only — never from free user text.
    if (dto.lat !== undefined && dto.lon !== undefined) {
      params.bias = `proximity:${dto.lon},${dto.lat}`;
    }

    const results = await this.fetchAndCache<LocationPlaceResult[]>(
      'searchPlaces',
      { query: dto.query, lat: dto.lat, lon: dto.lon, limit: dto.limit },
      () => `${this.geoapifyBaseUrl}/autocomplete`,
      () => params,
      this.mapSearchFeatures,
    );
    return results;
  }

  /**
   * Reverse-geocode coordinates into up to 5 nearby locality names.
   * @param dto {lat, lon} from the validated ReverseGeocodeDto
   */
  async reverse(dto: ReverseGeocodeParams): Promise<LocationReverseResult[]> {
    const params = {
      lat: dto.lat,
      lon: dto.lon,
      apiKey: this.geoapifyApiKey,
      limit: 5,
    };

    return this.fetchAndCache<LocationReverseResult[]>(
      'reverse',
      { lat: dto.lat, lon: dto.lon },
      () => `${this.geoapifyBaseUrl}/reverse`,
      () => params,
      this.mapReverseFeatures,
    );
  }

  /**
   * Shared upstream call + TTL-cache wrapper. Params are always built as typed
   * objects (T-30-15 — user text never reaches the URL through concatenation).
   */
  private async fetchAndCache<T>(
    method: 'searchPlaces' | 'reverse',
    cacheKeyParams: Record<string, unknown>,
    buildUrl: () => string,
    buildParams: () => Record<string, unknown>,
    mapFeatures: (features: unknown[]) => T,
  ): Promise<T> {
    const cacheKey = `${method}:${JSON.stringify(cacheKeyParams)}`;
    const cached = this.cacheGet(cacheKey);
    if (cached !== undefined) {
      return cached as T;
    }

    const body = await this.fetchUpstream<T>(buildUrl(), buildParams(), mapFeatures);
    this.cacheSet(cacheKey, body);
    return body;
  }

  private async fetchUpstream<T>(
    url: string,
    params: Record<string, unknown>,
    mapFeatures: (features: unknown[]) => T,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { params }).pipe(
          map((axiosResponse) => axiosResponse.data),
        ),
      );

      const features = Array.isArray(response?.features) ? response.features : [];
      this.logger.log(
        `Geoapify call ${url} returned ${features.length} features (credit usage tracked upstream)`,
      );
      return mapFeatures(features);
    } catch (error: any) {
      this.logger.error(
        `Geoapify call failed for ${url}: ${error?.message ?? 'unknown error'}`,
        error?.stack,
      );
      if (error.response) {
        throw new HttpException(
          `Geoapify API error: ${error.response.data?.message || error.message}`,
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        `Failed to perform geocoding request: ${url}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private readonly mapSearchFeatures = (features: unknown[]): LocationPlaceResult[] =>
    features.map((f: any) => {
      const props = f?.properties ?? {};
      const coords = Array.isArray(f?.geometry?.coordinates)
        ? f.geometry.coordinates
        : [undefined, undefined];
      const formatted = props.formatted ?? '';
      return {
        formatted,
        name: props.name ?? props.city ?? formatted,
        district: props.city ?? props.state ?? undefined,
        lat: coords[1],
        lon: coords[0],
        confidence: props.rank?.confidence ?? 0,
      };
    });

  private readonly mapReverseFeatures = (features: unknown[]): LocationReverseResult[] =>
    features.slice(0, 5).map((f: any) => {
      const props = f?.properties ?? {};
      const coords = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : [];
      return {
        name: props.name ?? props.city ?? props.formatted ?? '',
        lat: coords[1],
        lon: coords[0],
      };
    });

  private cacheGet(key: string): unknown {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cacheSet(key: string, value: unknown): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Evict in insertion order (oldest first) when full.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
