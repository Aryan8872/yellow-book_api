import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Users API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let testUserId: string;

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
        email: `admin-user-e2e-${timestamp}@example.com`,
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
    await prisma.user.deleteMany({
      where: { email: { contains: 'test-e2e' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'admin-user-e2e' } },
    });
    await app.close();
  });

  describe('POST /api/v1/admin/users', () => {
    it('should create a new user successfully', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test User E2E',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
          role: 'USER',
          phone: '+9779841234567',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data).toHaveProperty('name');
          expect(res.body.data).toHaveProperty('email');
          expect(res.body.data).toHaveProperty('role', 'USER');
          testUserId = res.body.data.id;
        });
    });

    it('should reject user creation without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'TestPass123!',
        })
        .expect(401);
    });

    it('should reject user creation with invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'TestPass123!',
        })
        .expect(400);
    });

    it('should reject user creation with invalid phone format', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test User',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
          phone: '123',
        })
        .expect(400);
    });

    it('should reject user creation with invalid role', () => {
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test User',
          email: `test-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
          role: 'INVALID_ROLE',
        })
        .expect(400);
    });

    it('should reject duplicate email', async () => {
      const timestamp = Date.now();
      const email = `test-e2e-${timestamp}@example.com`;

      // First user
      await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test User 1',
          email,
          password: 'TestPass123!',
        });

      // Duplicate email
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test User 2',
          email,
          password: 'TestPass123!',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/admin/users', () => {
    it('should return list of users', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should reject request without authentication', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .expect(401);
    });
  });

  describe('GET /api/v1/admin/users/:id', () => {
    it('should return user by id', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id', testUserId);
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/admin/users/:id', () => {
    it('should update user successfully', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Test User E2E',
          role: 'MERCHANT_ADMIN',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('name', 'Updated Test User E2E');
          expect(res.body.data).toHaveProperty('role', 'MERCHANT_ADMIN');
        });
    });

    it('should reject update with invalid phone format', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          phone: 'invalid-phone',
        })
        .expect(400);
    });

    it('should reject update with invalid avatar URL', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          avatarUrl: 'not-a-valid-url',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/admin/users/:id/activate', () => {
    it('should activate user successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/users/${testUserId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('isActive', true);
        });
    });

    it('should reject activation without authentication', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/users/${testUserId}/activate`)
        .expect(401);
    });
  });

  describe('POST /api/v1/admin/users/:id/deactivate', () => {
    it('should deactivate user successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/users/${testUserId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('isActive', false);
        });
    });

    it('should reject deactivation without authentication', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/users/${testUserId}/deactivate`)
        .expect(401);
    });
  });

  describe('DELETE /api/v1/admin/users/:id', () => {
    it('should delete user successfully', () => {
      // Create a new user to delete
      const timestamp = Date.now();
      return request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'User to Delete E2E',
          email: `delete-e2e-${timestamp}@example.com`,
          password: 'TestPass123!',
          role: 'USER',
        })
        .then((res) => {
          const userId = res.body.data.id;
          return request(app.getHttpServer())
            .delete(`/api/v1/admin/users/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
            .expect((response) => {
              expect(response.body).toHaveProperty('success', true);
            });
        });
    });

    it('should reject deletion without authentication', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/admin/users/some-id')
        .expect(401);
    });
  });
});
