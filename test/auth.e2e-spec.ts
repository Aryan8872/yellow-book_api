import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Authentication API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { contains: 'test-e2e' } },
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User E2E',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
          phone: '+9779841234567',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data).toHaveProperty('email');
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
        });
    });

    it('should reject registration with invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'TestPass123!',
        })
        .expect(400);
    });

    it('should reject registration with weak password', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: `test-e2e-${timestamp}@example.com`,
          password: '123',
        })
        .expect(400);
    });

    it('should reject duplicate email registration', async () => {
      const timestamp = Date.now();
      const email = `test-e2e-${timestamp}@example.com`;

      // First registration
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User E2E',
          email,
          password: 'TestPass123!',
        });

      // Duplicate registration
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User E2E',
          email,
          password: 'TestPass123!',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser: any;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User E2E',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
        });
      testUser = response.body.data;
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPass123!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
          expect(res.body.data).toHaveProperty('user');
          authToken = res.body.data.accessToken;
        });
    });

    it('should reject login with invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('should reject login with non-existent email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPass123!',
        })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let testUser: any;

    beforeEach(async () => {
      const timestamp = Date.now();
      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User E2E',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
        });
      testUser = registerResponse.body.data;

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPass123!',
        });
      authToken = loginResponse.body.data.accessToken;
    });

    it('should return current user with valid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id', testUser.id);
          expect(res.body.data).toHaveProperty('email', testUser.email);
        });
    });

    it('should reject request without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should reject request with invalid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User E2E',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
        });
      refreshToken = registerResponse.body.data.refreshToken;
    });

    it('should refresh access token with valid refresh token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
        });
    });

    it('should reject refresh with invalid token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });
});
