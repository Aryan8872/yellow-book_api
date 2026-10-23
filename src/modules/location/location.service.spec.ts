import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { LocationService } from './location.service';

// Geoapify geocoding responses are GeoJSON by default: features[].geometry
// coordinates are [lon, lat] and properties carry formatted/name/city/rank.
const geoFeature = (lon: number, lat: number, props: Record<string, unknown>) => ({
  geometry: { coordinates: [lon, lat] },
  properties: props,
});

describe('LocationService', () => {
  let service: LocationService;
  let target: any; // RED-to-GREEN bridge: searchPlaces/reverse do not exist until the GREEN step
  let mockHttpService: { get: jest.Mock };

  const autocompleteCall = () => {
    expect(mockHttpService.get).toHaveBeenCalled();
    const [url, config] = mockHttpService.get.mock.calls[0];
    return { url, params: config.params as Record<string, unknown> };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockHttpService = {
      get: jest.fn(
        () =>
          of({
            data: {
              features: [
                geoFeature(87.28, 26.64, {
                  formatted: 'Ram Chowk, Birtamod, Nepal',
                  name: 'Ram Chowk',
                  city: 'Birtamod',
                  state: 'Kosi',
                  rank: { confidence: 0.65 },
                }),
                geoFeature(87.14, 26.81, {
                  formatted: 'Dharan, Nepal',
                  city: 'Dharan',
                  state: 'Koshi',
                  rank: { confidence: 0.4 },
                }),
                geoFeature(85.32, 27.7, {
                  formatted: 'Thamel, Kathmandu, Nepal',
                  rank: { confidence: 1 },
                }),
              ],
            },
          }) as never,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'test-key') } },
      ],
    }).compile();

    service = module.get(LocationService);
    target = service as any;
  });

  describe('searchPlaces', () => {
    it('maps GeoJSON features to {formatted, name, district, lat, lon, confidence}', async () => {
      const results = await target.searchPlaces({ query: 'Birtamod' });

      expect(results).toEqual([
        {
          formatted: 'Ram Chowk, Birtamod, Nepal',
          name: 'Ram Chowk',
          district: 'Birtamod',
          lat: 26.64,
          lon: 87.28,
          confidence: 0.65,
        },
        {
          formatted: 'Dharan, Nepal',
          name: 'Dharan',
          district: 'Dharan',
          lat: 26.81,
          lon: 87.14,
          confidence: 0.4,
        },
        {
          formatted: 'Thamel, Kathmandu, Nepal',
          name: 'Thamel, Kathmandu, Nepal',
          district: undefined,
          lat: 27.7,
          lon: 85.32,
          confidence: 1,
        },
      ]);
    });

    it('sends filter=countrycode:np and does NOT send format (the verified [] bug)', async () => {
      await target.searchPlaces({ query: 'Birtamod' });

      const { url, params } = autocompleteCall();
      expect(url).toContain('/geocode/autocomplete');
      expect(params).toEqual(
        expect.objectContaining({
          text: 'Birtamod',
          filter: 'countrycode:np',
          lang: 'en',
          apiKey: 'test-key',
        }),
      );
      expect(params.format).toBeUndefined();
    });

    it('adds proximity bias only when both lat and lon are supplied', async () => {
      await target.searchPlaces({ query: 'Birtamod', lat: 26.64, lon: 87.28 } as any);
      const withBias = autocompleteCall();
      expect(withBias.params.bias).toBe('proximity:87.28,26.64');

      mockHttpService.get.mockClear();
      await target.searchPlaces({ query: 'Birtamod', lat: 26.64 } as any);
      const latOnly = autocompleteCall();
      expect(latOnly.params.bias).toBeUndefined();

      mockHttpService.get.mockClear();
      await target.searchPlaces({ query: 'Birtamod' });
      const noCoords = autocompleteCall();
      expect(noCoords.params.bias).toBeUndefined();
    });
  });

  describe('reverse', () => {
    it('maps a reverse response to up to 5 {name, lat, lon} localities', async () => {
      const five = Array.from({ length: 7 }, (_, i) =>
        geoFeature(87.28 + i * 0.01, 26.64 + i * 0.01, {
          formatted: `Loc ${i}, Nepal`,
          name: `Loc ${i}`,
        }),
      );
      mockHttpService.get.mockReturnValue(
        of({ data: { features: five } }) as never,
      );

      const results = await target.reverse({ lat: 26.64, lon: 87.28 } as any);

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({ name: 'Loc 0', lat: 26.64, lon: 87.28 });
      expect(results[4]).toEqual({ name: 'Loc 4', lat: 26.68, lon: 87.32 });

      const { url, params } = (() => {
        const [u, c] = mockHttpService.get.mock.calls[0];
        return { url: u as string, params: (c as any).params as Record<string, unknown> };
      })();
      expect(url).toContain('/geocode/reverse');
      expect(params.limit).toBe(5);
    });

    it('falls back to city then formatted for the locality name', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            features: [
              geoFeature(87.28, 26.64, {
                formatted: 'Somewhere, Nepal',
                city: 'Birtamod',
              }),
            ],
          },
        }) as never,
      );

      const results = await target.reverse({ lat: 26.64, lon: 87.28 } as any);

      expect(results[0].name).toBe('Birtamod');
    });
  });

  describe('TTL cache', () => {
    it('serves repeated identical queries from cache without hitting HttpService again', async () => {
      await target.searchPlaces({ query: 'Birtamod' });
      await target.searchPlaces({ query: 'Birtamod' });
      await target.searchPlaces({ query: 'Birtamod' });

      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    });

    it('expires cache entries after the 5-minute TTL', async () => {
      jest.useFakeTimers();

      await target.searchPlaces({ query: 'Birtamod' });
      expect(mockHttpService.get).toHaveBeenCalledTimes(1);

      jest.setSystemTime(jest.now() + 300_001);

      await target.searchPlaces({ query: 'Birtamod' });
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);

      await target.searchPlaces({ query: 'Birtamod' });
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('evicts the oldest entries beyond 500', async () => {
      const many = Array.from({ length: 501 }, (_, i) => `Place ${i}`);
      for (const query of many) {
        await target.searchPlaces({ query });
      }
      const afterFill = mockHttpService.get.mock.calls.length;
      expect(afterFill).toBe(501);

      // The very first key was evicted when the cache hit 500 → upstream again.
      await target.searchPlaces({ query: many[0] });
      expect(mockHttpService.get.mock.calls.length).toBe(502);

      // A recent key is still cached.
      await target.searchPlaces({ query: many[500] });
      expect(mockHttpService.get.mock.calls.length).toBe(502);
    });
  });

  describe('upstream error handling', () => {
    it('surfaces upstream HTTP errors as HttpException', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { status: 502, data: { message: 'Bad gateway' } },
        })) as never,
      );

      await expect(
        target.searchPlaces({ query: 'Birtamod' }),
      ).rejects.toThrow(HttpException);
    });
  });
});
