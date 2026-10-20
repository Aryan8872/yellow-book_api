import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Offers API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantToken: string;
  let testMerchantId: string;
  let testCategoryId: string;
  let testOfferId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create test merchant
    const timestamp = Date.now();
    const merchantResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: `Test Merchant E2E ${timestamp}`,
        email: `merchant-offer-e2e-${timestamp}@example.com`,
        password: 'MerchantPass123!',
        role: 'MERCHANT_ADMIN',
      });

    // Create merchant record
    const merchant = await prisma.merchant.create({
      data: {
        name: `Test Merchant E2E ${timestamp}`,
        contactEmail: `merchant-offer-e2e-${timestamp}@example.com`,
        contactPhone: '+9779841234567',
        status: 'ACTIVE',
        onboardedAt: new Date(),
      },
    });
    testMerchantId = merchant.id;

    // Link user to merchant
    await prisma.user.update({
      where: { id: merchantResponse.body.data.id },
      data: { merchantId: testMerchantId },
    });

    // Get merchant token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: merchantResponse.body.data.email,
        password: 'MerchantPass123!',
      });
    merchantToken = loginResponse.body.data.accessToken;

    // Create test category
    const category = await prisma.category.create({
      data: {
        name: 'Test Category E2E',
        slug: 'test-category-e2e',
        color: '#FF0000',
      },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.offer.deleteMany({
      where: { title: { contains: 'Test Offer E2E' } },
    });
    await prisma.category.deleteMany({
      where: { slug: 'test-category-e2e' },
    });
    await prisma.merchant.deleteMany({
      where: { name: { contains: 'Test Merchant E2E' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'merchant-offer-e2e' } },
    });
    await app.close();
  });

  describe('POST /api/v1/offers', () => {
    it('should create a new offer successfully', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          title: `Test Offer E2E ${timestamp}`,
          description: 'Test offer description for E2E testing',
          categoryId: testCategoryId,
          estimatedSavingsNpr: 500,
          originalPriceNpr: 1000,
          discountPercentage: 50,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data).toHaveProperty('title');
          expect(res.body.data).toHaveProperty('isActive', true);
          testOfferId = res.body.data.id;
        });
    });

    it('should reject offer creation without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/offers')
        .send({
          title: 'Test Offer',
          description: 'Test description',
          categoryId: testCategoryId,
          estimatedSavingsNpr: 500,
        })
        .expect(401);
    });

    it('should reject offer creation with missing required fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          title: 'Test Offer',
        })
        .expect(400);
    });

    it('should reject offer creation with invalid discount percentage', () => {
      return request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          title: 'Test Offer',
          description: 'Test description',
          categoryId: testCategoryId,
          estimatedSavingsNpr: 500,
          discountPercentage: 150, // Invalid: > 100
        })
        .expect(400);
    });

    it('should reject offer creation with invalid image URL', () => {
      return request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          title: 'Test Offer',
          description: 'Test description',
          categoryId: testCategoryId,
          estimatedSavingsNpr: 500,
          coverImage: 'not-a-valid-url',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/offers', () => {
    it('should return list of offers', () => {
      return request(app.getHttpServer())
        .get('/api/v1/offers')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter offers by category', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/offers?category=${testCategoryId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should search offers by query', () => {
      return request(app.getHttpServer())
        .get('/api/v1/offers?q=Test')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
  });

  describe('GET /api/v1/offers/:id', () => {
    it('should return offer by id', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/offers/${testOfferId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id', testOfferId);
          expect(res.body.data).toHaveProperty('merchant');
          expect(res.body.data).toHaveProperty('category');
        });
    });

    it('should return 404 for non-existent offer', () => {
      return request(app.getHttpServer())
        .get('/api/v1/offers/non-existent-id')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/offers/:id', () => {
    it('should update offer successfully', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/offers/${testOfferId}`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          title: 'Updated Test Offer E2E',
          description: 'Updated description',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('title', 'Updated Test Offer E2E');
        });
    });

    it('should reject update without authentication', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/offers/${testOfferId}`)
        .send({ title: 'Updated' })
        .expect(401);
    });

    it('should deactivate offer', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/offers/${testOfferId}`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          isActive: false,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('isActive', false);
        });
    });
  });

  describe('DELETE /api/v1/offers/:id', () => {
    it('should delete offer successfully', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/offers/${testOfferId}`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
        });
    });

    it('should reject deletion without authentication', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/offers/some-id')
        .expect(401);
    });
  });
});
