---
last_mapped_commit: 8d310acc40fa1a65d601fcb442dd154f984038ee
last_mapped_at: 2026-10-05
---

# External Integrations

**Analysis Date:** 2026-10-05

## Database Integration

### PostgreSQL (Railway)

- **Purpose:** Primary relational database for all application data
- **Connection:** Via `DATABASE_URL` environment variable
- **ORM:** Prisma ORM with type-safe client generation
- **Schema Location:** `prisma/schema.prisma`
- **Migrations:** `prisma/migrations/` directory
- **Key Models:**
  - User, OAuthAccount, FamilyGroup
  - Subscription, Plan, PspWebhookEvent
  - Merchant, MerchantBranch, MerchantStaff
  - Offer, Category
  - RedemptionSession
  - Payout, AuditLog, FraudFlag
- **Connection Pooling:** Managed by Prisma client
- **Indexes:** Strategic indexes on frequently queried fields (email, status, dates, geospatial)

### Prisma Client

- **Location:** `src/infrastructure/prisma/prisma.service.ts`
- **Module:** `PrismaModule` in `src/infrastructure/prisma/prisma.module.ts`
- **Usage:** Injected as `PrismaService` across domain modules
- **Lifecycle:** Singleton service with connection management

## Caching & Session Storage

### Redis

- **Purpose:** 
  - Rate limiting storage (sliding window)
  - Distributed locking
  - Session caching (potential future use)
- **Connection:** Via `REDIS_URL` environment variable
- **Client:** ioredis v6.0.0
- **Module:** `RedisModule` in `src/infrastructure/redis/redis.module.ts`
- **Services:**
  - `ThrottlerStorageRedisService` - Custom Redis-backed rate limit storage
  - `DistributedLockService` - Distributed locking mechanism
- **Default:** Falls back to local Redis at `redis://127.0.0.1:6379` if not configured

## Authentication Providers

### Google OAuth 2.0

- **Purpose:** User authentication via Google accounts
- **Strategy:** `passport-google-oauth20`
- **Implementation:** `src/modules/auth/strategies/google.strategy.ts`
- **Environment Variables:**
  - `GOOGLE_CLIENT_ID` - OAuth client ID
  - `GOOGLE_CLIENT_SECRET` - OAuth client secret
  - `GOOGLE_CALLBACK_URL` - OAuth callback endpoint
- **Callback Endpoint:** `/api/v1/auth/google/callback`
- **Flow:**
  1. User initiates OAuth via `/api/v1/auth/google`
  2. Redirect to Google consent screen
  3. Google redirects to callback URL with authorization code
  4. Exchange code for access/refresh tokens
  5. Create/update `OAuthAccount` record
  6. Generate JWT tokens for API access

### Local Authentication

- **Purpose:** Email/password authentication
- **Strategy:** `passport-local`
- **Implementation:** `src/modules/auth/strategies/local.strategy.ts`
- **Password Hashing:** bcrypt with salt rounds
- **Flow:**
  1. User submits email/password
  2. Validate credentials against `User.passwordHash`
  3. Generate JWT tokens for API access

## File Storage

### Cloudinary

- **Purpose:** Cloud-based image and file storage
- **Library:** cloudinary v2.11.0
- **Module:** `UploadModule` in `src/modules/upload/upload.module.ts`
- **Service:** `UploadService` in `src/modules/upload/upload.service.ts`
- **Environment Variables:**
  - `CLOUDINARY_CLOUD_NAME` - Cloud account name
  - `CLOUDINARY_API_KEY` - API key
  - `CLOUDINARY_API_SECRET` - API secret
- **Features:**
  - Image upload
  - Automatic optimization
  - Transformation support
  - CDN delivery
- **Fallback:** Local storage driver (`STORAGE_DRIVER=local`) for development
- **Local Storage:** Serves files from `uploads/` directory at `/uploads/` prefix

## Payment Service Providers (PSP)

### Planned Integrations

The schema supports multiple PSPs for subscription billing:
- **Stripe** - Global payment processing
- **eSewa** - Nepal local payment gateway
- **Khalti** - Nepal local payment gateway

**Current State:** Infrastructure in place but not yet fully implemented
- `PspWebhookEvent` model stores webhook payloads
- `Subscription` model tracks PSP customer/subscription IDs
- `SubscriptionStatus` enum tracks payment lifecycle

**Webhook Handling:**
- Endpoint: To be implemented
- Idempotency: Natural idempotency via PSP event ID as primary key
- Audit trail: Raw payload stored in `payload` JSON field

## API Documentation

### Swagger/OpenAPI

- **Purpose:** Interactive API documentation
- **Library:** @nestjs/swagger
- **Endpoint:** `/docs`
- **Features:**
  - Auto-generated from controller decorators
  - JWT Bearer authentication
  - API Key authentication
  - Request/response examples
  - Schema validation display
- **Configuration:** `src/main.ts` (DocumentBuilder setup)

## Monitoring & Metrics

### Prometheus Metrics

- **Purpose:** Application performance monitoring
- **Library:** prom-client v15.1.3
- **Module:** `MetricsModule` in `src/infrastructure/metrics/metrics.module.ts`
- **Endpoint:** `/metrics` (standard Prometheus endpoint)
- **Interceptor:** `MetricsInterceptor` tracks HTTP request metrics
- **Metrics Collected:**
  - Request count by route
  - Request duration
  - Error rates

## Logging

### Pino Logger

- **Purpose:** Structured JSON logging
- **Library:** nestjs-pino, pino, pino-http
- **Configuration:** `src/app.module.ts` (LoggerModule.forRoot)
- **Development:** Pretty-printed logs via pino-pretty
- **Production:** JSON logs for log aggregation
- **Features:**
  - Request correlation IDs
  - Automatic request/response logging
  - Configurable log levels
  - Ignored routes: `/health`, `/metrics`

## Deployment Platform

### Railway

- **Purpose:** Cloud hosting platform
- **Services:**
  - PostgreSQL database
  - Redis cache
  - Application deployment
- **Configuration Files:**
  - `railway.json` - Railway project configuration
  - `railway.toml` - Railway service definitions
- **Database URL:** Provided via Railway environment variables
- **Redis URL:** Provided via Railway environment variables

## Docker

### Multi-stage Build

- **Base Image:** node:20-alpine
- **Builder Stage:** Compiles TypeScript, generates Prisma client
- **Production Stage:** Minimal runtime image with compiled code
- **Optimizations:**
  - Layer caching for dependencies
  - Prisma schema copied before install
  - Clean build (removes tsconfig.tsbuildinfo)
  - Copy entire pnpm virtual store (no re-install needed)
- **Runtime Dependencies:** OpenSSL for Prisma on Alpine

## CORS Configuration

### Cross-Origin Resource Sharing

- **Purpose:** Control which origins can access the API
- **Configuration:** `src/main.ts` (app.enableCors)
- **Environment Variable:** `CORS_ALLOWED_ORIGINS` (comma-separated)
- **Development:** Allows all origins if `NODE_ENV !== 'production'`
- **Production:** Strict origin validation
- **Allowed Headers:**
  - Content-Type
  - Authorization
  - x-correlation-id
  - x-api-key
  - idempotency-key
  - x-client-version
- **Methods:** GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Credentials:** Enabled (for cookie-based auth if needed)

## Security Headers

### Helmet

- **Purpose:** Security hardening via HTTP headers
- **Library:** helmet v8.3.0
- **Configuration:** `src/main.ts`
- **Features:**
  - Content Security Policy (production only)
  - Cross-Origin Embedder Policy: false
  - Various security headers (HSTS, X-Frame-Options, etc.)

## Rate Limiting

### Throttler

- **Purpose:** Prevent API abuse
- **Library:** @nestjs/throttler
- **Storage:** Redis-backed via `ThrottlerStorageRedisService`
- **Configuration:** `src/app.module.ts`
- **Limits:**
  - Default: 100 requests per minute
  - Redemption: 20 requests per minute (stricter for redemption flows)
- **Guard:** Global `ThrottlerGuard` applied via APP_GUARD

## Future Integrations (Planned)

### Email Service

- **Purpose:** User verification, password reset, notifications
- **Status:** Not yet implemented
- **Schema Support:** User.email, User.isVerified fields present

### SMS Service

- **Purpose:** Phone verification, OTP delivery
- **Status:** Not yet implemented
- **Schema Support:** User.phone field present

### Push Notifications

- **Purpose:** Real-time offer alerts, redemption confirmations
- **Status:** Not yet implemented

---
*Codebase analysis: 2026-10-05*
