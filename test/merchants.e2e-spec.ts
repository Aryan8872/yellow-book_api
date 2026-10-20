import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Merchants API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let testMerchantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create admin user and get token
    const timestamp = Date.now();
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Admin User E2E',
        email: `admin-e2e-${timestamp}@example.com`,
        password: 'AdminPass123!',
        role: 'ADMIN',
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registerResponse.body.data.email,
        password: 'AdminPass123!',
      });

    adminToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.merchant.deleteMany({
      where: { name: { contains: 'Test E2E' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'admin-e2e' } },
    });
    await app.close();
  });

  describe('POST /api/v1/admin/merchants', () => {
    it('should create a new merchant successfully', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Test Merchant E2E ${timestamp}`,
          contactEmail: `merchant-e2e-${timestamp}@example.com`,
          contactPhone: '+9779841234567',
          panNumber: `TESTPAN${timestamp}`,
          vatNumber: `TESTVAT${timestamp}`,
          description: 'Test merchant for E2E testing',
          websiteUrl: `https://testmerchant${timestamp}.com`,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data).toHaveProperty('name');
          expect(res.body.data).toHaveProperty('contactEmail');
          expect(res.body.data).toHaveProperty('status', 'ACTIVE');
          testMerchantId = res.body.data.id;
        });
    });

    it('should reject merchant creation without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/merchants')
        .send({
          name: 'Test Merchant',
          contactEmail: 'test@example.com',
        })
        .expect(401);
    });

    it('should reject merchant creation with invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Merchant',
          contactEmail: 'invalid-email',
        })
        .expect(400);
    });

    it('should reject merchant creation with invalid phone format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Merchant',
          contactEmail: 'test@example.com',
          contactPhone: '123',
        })
        .expect(400);
    });

    it('should reject duplicate email', async () => {
      const timestamp = Date.now();
      const email = `merchant-e2e-${timestamp}@example.com`;

      // First merchant
      await request(app.getHttpServer())
        .post('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Merchant 1',
          contactEmail: email,
        });

      // Duplicate email
      return request(app.getHttpServer())
        .post('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Merchant 2',
          contactEmail: email,
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/admin/merchants', () => {
    it('should return list of merchants', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should reject request without authentication', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .expect(401);
    });
  });

  describe('GET /api/v1/admin/merchants/:id', () => {
    it('should return merchant by id', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/admin/merchants/${testMerchantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id', testMerchantId);
        });
    });

    it('should return 404 for non-existent merchant', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/admin/merchants/:id', () => {
    it('should update merchant successfully', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/admin/merchants/${testMerchantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Test Merchant E2E',
          description: 'Updated description',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('name', 'Updated Test Merchant E2E');
        });
    });

    it('should reject update with invalid phone format', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/admin/merchants/${testMerchantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contactPhone: 'invalid-phone',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/admin/merchants/:id/approve', () => {
    it('should approve merchant successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/merchants/${testMerchantId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('status', 'ACTIVE');
        });
    });
  });

  describe('POST /api/v1/admin/merchants/:id/suspend', () => {
    it('should suspend merchant successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/merchants/${testMerchantId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('status', 'SUSPENDED');
        });
    });
  });

  describe('POST /api/v1/admin/merchants/:id/reactivate', () => {
    it('should reactivate suspended merchant successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/merchants/${testMerchantId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('status', 'ACTIVE');
        });
    });
  });
});
