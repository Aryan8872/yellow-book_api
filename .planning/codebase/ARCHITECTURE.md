---
last_mapped_commit: 8d310acc40fa1a65d601fcb442dd154f984038ee
last_mapped_at: 2026-10-05
---

# Architecture

**Analysis Date:** 2026-10-05

## Architectural Pattern

**Layered Modular Architecture** following NestJS best practices with Domain-Driven Design (DDD) influences.

### Layers

1. **Presentation Layer** (Controllers)
   - HTTP request handling
   - Request validation via DTOs
   - Response transformation
   - Location: `src/modules/*/controller.ts`

2. **Application Layer** (Services)
   - Business logic implementation
   - Orchestration of domain operations
   - External service integration
   - Location: `src/modules/*/service.ts`

3. **Infrastructure Layer** (Infrastructure)
   - Database access (Prisma)
   - External integrations (Redis, Cloudinary)
   - Cross-cutting concerns (logging, metrics)
   - Location: `src/infrastructure/`

4. **Domain Layer** (Models & DTOs)
   - Data transfer objects
   - Domain types and interfaces
   - Business rules validation
   - Location: `src/modules/*/dto/`, `src/modules/*/*.types.ts`

## Module Structure

### Core Modules (Domain)

**Auth Module** (`src/modules/auth/`)
- Authentication and authorization
- JWT token management
- OAuth integration (Google)
- Role-based access control
- Guards: `JwtAuthGuard`, `RolesGuard`, `ApiKeyGuard`
- Strategies: `LocalStrategy`, `JwtStrategy`, `GoogleStrategy`

**Offer Module** (`src/modules/offer/`)
- Offer CRUD operations
- Offer search and filtering
- Merchant offer management
- Trending calculation
- Location: `src/modules/offer/`

**Category Module** (`src/modules/category/`)
- Category management
- Offer categorization
- Hierarchical organization (flat currently)
- Location: `src/modules/category/`

**Redemption Module** (`src/modules/redemption/`)
- Voucher redemption flow
- Code generation and validation
- Fraud detection hooks
- Geo-location verification
- Location: `src/modules/redemption/`

**Upload Module** (`src/modules/upload/`)
- File upload handling
- Cloudinary integration
- Local storage fallback
- Location: `src/modules/upload/`

### Infrastructure Modules

**Prisma Module** (`src/infrastructure/prisma/`)
- Database connection management
- Prisma client singleton
- Lifecycle hooks
- Location: `src/infrastructure/prisma/`

**Redis Module** (`src/infrastructure/redis/`)
- Redis connection management
- Distributed locking
- Rate limit storage
- Location: `src/infrastructure/redis/`

**Metrics Module** (`src/infrastructure/metrics/`)
- Prometheus metrics collection
- HTTP request tracking
- Custom metrics registration
- Location: `src/infrastructure/metrics/`

### Common Layer

**Filters** (`src/common/filters/`)
- Global exception handling
- RFC 7807 error responses
- Prisma exception translation
- Location: `src/common/filters/`

**Interceptors** (`src/common/interceptors/`)
- Response transformation
- Idempotency handling
- Metrics collection
- Location: `src/common/interceptors/`

**Guards** (`src/modules/auth/guards/`)
- JWT authentication
- Role-based authorization
- API key validation
- Location: `src/modules/auth/guards/`

**Pipes** (`src/common/pipes/`)
- Validation pipe configuration
- Custom validation logic
- Location: `src/common/pipes/`

**Middlewares** (`src/common/middlewares/`)
- Correlation ID injection
- Request context setup
- Location: `src/common/middlewares/`

**Decorators** (`src/common/decorators/`)
- Custom parameter decorators
- Current user injection
- Correlation ID access
- Location: `src/common/decorators/`

## Data Flow

### Request Lifecycle

1. **Incoming Request**
   - HTTP request hits Express server
   - `CorrelationIdMiddleware` injects correlation ID

2. **Global Guards**
   - `ThrottlerGuard` - Rate limiting check (Redis)
   - `ApiKeyGuard` - M2M API key validation
   - `JwtAuthGuard` - User authentication
   - `RolesGuard` - Role-based authorization

3. **Interceptors**
   - `MetricsInterceptor` - Start metrics timer
   - `IdempotencyInterceptor` - Check for idempotency key
   - `TransformResponseInterceptor` - Response shape normalization

4. **Controller**
   - Route handler execution
   - DTO validation (ValidationPipe)
   - Service method invocation

5. **Service**
   - Business logic execution
   - Database operations (Prisma)
   - External service calls (Redis, Cloudinary)
   - Domain validation

6. **Response**
   - Interceptors post-process response
   - Metrics recorded
   - RFC 7807 error formatting if exception
   - JSON response sent

### Authentication Flow

**Local Auth:**
1. User POSTs credentials to `/api/v1/auth/login`
2. `LocalStrategy` validates email/password
3. `AuthService` generates JWT access + refresh tokens
4. Tokens returned in response

**OAuth Flow:**
1. User initiates `/api/v1/auth/google`
2. Redirect to Google consent screen
3. Google redirects to `/api/v1/auth/google/callback`
4. `GoogleStrategy` exchanges code for tokens
5. `AuthService` creates/updates `OAuthAccount`
6. JWT tokens generated and returned

**JWT Validation:**
1. Request includes `Authorization: Bearer <token>`
2. `JwtAuthGuard` extracts and validates token
3. `JwtStrategy` decodes payload
4. User attached to request context via `@CurrentUser()`

### Redemption Flow

1. User requests offer redemption
2. `RedemptionService` validates:
   - User subscription status
   - Offer availability
   - Max per user limit
   - Geo-location (if required)
3. Generate unique redemption code
4. Store `RedemptionSession` with INIT status
5. Return code with expiration
6. Merchant validates code at POS
7. Update status to REDEEMED
8. Trigger fraud detection checks
9. Update offer redemption count

## Security Architecture

### Authentication Strategies

- **JWT Tokens:** Stateless authentication with access + refresh tokens
- **OAuth 2.0:** Third-party authentication (Google)
- **API Keys:** Machine-to-machine authentication
- **Local Auth:** Email/password with bcrypt hashing

### Authorization

- **Role-Based Access Control (RBAC):**
  - USER - Regular customer
  - MERCHANT_STAFF - Merchant employee
  - MERCHANT_ADMIN - Merchant manager
  - ADMIN - Platform administrator
- **Guards:** `@Roles()` decorator with `RolesGuard`
- **Route Protection:** `@Public()` bypasses auth, `@RequireApiKey()` enforces M2M

### Security Layers

1. **Network Layer:** Helmet security headers, CORS configuration
2. **Rate Limiting:** Redis-backed sliding window throttling
3. **Authentication:** JWT/OAuth/API key validation
4. **Authorization:** Role-based access control
5. **Input Validation:** class-validator DTOs
6. **Output Sanitization:** Response transformation interceptor
7. **Audit Logging:** AuditLog model tracks sensitive operations

### Fraud Detection

- **Geo-Location Verification:** User location vs branch location
- **Rate Limiting:** Strict limits on redemption endpoints
- **Pattern Detection:** Rapid redemption attempts
- **Audit Trail:** `FraudFlag` model for manual review

## Database Architecture

### Schema Design

**Relational Model:**
- Normalized schema with foreign key relationships
- Cascade deletes for cleanup (e.g., User deletion cascades to OAuthAccount)
- Restrict deletes for data integrity (e.g., Category deletion restricted if offers exist)

**Indexes:**
- Strategic indexes on frequently queried fields
- Composite indexes for common query patterns
- Geospatial indexes on `MerchantBranch.lat/lng`

**Soft Deletes:**
- `User.deletedAt` for soft deletion
- Preserves historical data and relationships

**Enums:**
- Type-safe enums for status fields (UserRole, SubscriptionStatus, MerchantStatus, etc.)
- Prevents invalid state transitions

### Data Relationships

**User-Centric:**
- User → Subscription (1:1)
- User → OAuthAccount[] (1:N)
- User → RedemptionSession[] (1:N)
- User → FamilyGroup (owner or member)
- User → MerchantStaff (optional)

**Merchant-Centric:**
- Merchant → MerchantBranch[] (1:N)
- Merchant → Offer[] (1:N)
- Merchant → MerchantStaff[] (1:N)
- Merchant → Payout[] (1:N)

**Offer-Centric:**
- Offer → Category (N:1)
- Offer → RedemptionSession[] (1:N)

**Redemption-Centric:**
- RedemptionSession → User (N:1)
- RedemptionSession → Offer (N:1)
- RedemptionSession → MerchantBranch (optional N:1)
- RedemptionSession → MerchantStaff (optional N:1)

## Caching Strategy

### Redis Usage

**Rate Limiting:**
- Sliding window algorithm
- Per-IP and per-endpoint limits
- Redis-backed for distributed environments

**Distributed Locking:**
- Prevent race conditions in critical operations
- Key-based locking with TTL
- Used in redemption flow (potential)

**Future Caching:**
- Session caching
- Offer list caching
- Category tree caching

## Error Handling

### Exception Filter

**Global Filter:** `AllExceptionsFilter` (`src/common/filters/all-exceptions.filter.ts`)

**Handles:**
- HttpException (NestJS built-in)
- ValidationPipe errors (class-validator)
- Prisma exceptions (database errors)
- Unknown exceptions

**Response Format (RFC 7807):**

```json
{
  "type": "https://example.com/probs/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more fields failed validation",
  "instance": "/api/v1/offers",
  "errors": [
    {
      "field": "title",
      "message": "Title is required"
    }
  ]
}
```

### Validation

**DTO Validation:**
- class-validator decorators on DTOs
- Global ValidationPipe in `main.ts`
- Custom error codes via `AppErrorCode`

**Custom Validation Pipe:**
- `createValidationPipe()` in `src/common/pipes/validation.pipe.ts`
- Shapes validation errors uniformly
- Whitelists DTO properties (strip extra fields)

## API Design

### RESTful Conventions

- **Resource Naming:** Plural nouns (`/offers`, `/categories`)
- **HTTP Methods:** GET (read), POST (create), PUT/PATCH (update), DELETE (delete)
- **Versioning:** URI versioning (`/api/v1/`)
- **Pagination:** Query parameters (`page`, `limit`)
- **Filtering:** Query parameters (`?category=dining`)
- **Sorting:** Query parameters (`?sort=-createdAt`)

### Response Format

**Success Response:**

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-10-05T00:00:00Z",
    "correlationId": "abc-123"
  }
}
```

**Error Response:** RFC 7807 format (see Error Handling section)

### Idempotency

**Interceptor:** `IdempotencyInterceptor` (`src/common/interceptors/idempotency.interceptor.ts`)

**Mechanism:**
- Client provides `idempotency-key` header
- First request executes and caches result
- Subsequent requests with same key return cached result
- Prevents duplicate operations (e.g., double redemption)

## Scalability Considerations

### Horizontal Scaling

- **Stateless Authentication:** JWT tokens enable horizontal scaling
- **Redis-backed Rate Limiting:** Distributed rate limiting across instances
- **Database Connection Pooling:** Prisma manages connection pool
- **Containerization:** Docker enables easy deployment scaling

### Performance Optimizations

- **Database Indexes:** Strategic indexes on hot paths
- **Response Compression:** Gzip/Brotli via compression middleware
- **Static Asset Serving:** Local uploads served via Express static
- **CDN:** Cloudinary for image delivery
- **Lazy Loading:** Prisma selective field loading

### Monitoring

- **Prometheus Metrics:** Request duration, error rates, request counts
- **Structured Logging:** JSON logs with correlation IDs
- **Health Checks:** `/health` endpoint for load balancer checks
- **Swagger Docs:** Interactive API documentation

## Deployment Architecture

### Container Strategy

**Multi-stage Docker Build:**
- Builder stage: Dependencies + TypeScript compilation
- Production stage: Minimal runtime + compiled code
- Alpine Linux for small image size
- Prisma client pre-generated

### Environment Configuration

- **Environment Variables:** All configuration via `.env`
- **Config Module:** @nestjs/config for centralized config
- **Secrets Management:** Railway provides secrets at runtime
- **Development:** `.env.example` as template

### CI/CD (Planned)

- Railway automatic deployments on git push
- Database migrations via Prisma
- Health checks before routing traffic

---
*Codebase analysis: 2026-10-05*
