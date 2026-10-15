import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

// @nestjs/swagger ships ESM-only; mock the decorator factories so the DTO
// loads under the CommonJS/Jest runtime (same precedent as the qrcode mock
// in redemption.service.spec.ts).
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

import { ListMerchantOffersDto } from './list-merchant-offers.dto';

describe('ListMerchantOffersDto', () => {
  it('coerces query-string page/limit to NUMBERS (regression: take:"20" 500)', async () => {
    const dto = plainToInstance(ListMerchantOffersDto, {
      page: '2',
      limit: '20',
    });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(20);
    expect(typeof dto.page).toBe('number');
    expect(typeof dto.limit).toBe('number');

    expect(await validate(dto)).toHaveLength(0);
  });

  it("transforms the string 'false' to boolean false (not truthy)", () => {
    const dto = plainToInstance(ListMerchantOffersDto, {
      isActive: 'false',
      isFeatured: 'true',
    });

    expect(dto.isActive).toBe(false);
    expect(dto.isFeatured).toBe(true);
  });

  it('applies defaults on an empty query', async () => {
    const dto = plainToInstance(ListMerchantOffersDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe('createdAt');
    expect(dto.sortOrder).toBe('desc');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects limit below the minimum', async () => {
    const dto = plainToInstance(ListMerchantOffersDto, { limit: '0' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('rejects limit above the maximum', async () => {
    const dto = plainToInstance(ListMerchantOffersDto, { limit: '201' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('max');
  });

  it('rejects a sortBy outside the whitelist', async () => {
    const dto = plainToInstance(ListMerchantOffersDto, { sortBy: 'evil' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('rejects a non-numeric limit', async () => {
    const dto = plainToInstance(ListMerchantOffersDto, { limit: 'abc' });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
