---
last_mapped_commit: 8d310acc40fa1a65d601fcb442dd154f984038ee
last_mapped_at: 2026-10-05
---

# Code Conventions

**Analysis Date:** 2026-10-05

## TypeScript Conventions

### Type Safety

- **Strict Mode:** Partial strict mode enabled
  - `strictNullChecks: true`
  - `noImplicitAny: false` (allows implicit any for flexibility)
  - `strictBindCallApply: false`
  - `noFallthroughCasesInSwitch: false`

- **Decorators:** Enabled for NestJS
  - `experimentalDecorators: true`
  - `emitDecoratorMetadata: true`

- **Module System:** ES2023 with nodenext resolution
  - `module: "nodenext"`
  - `moduleResolution: "nodenext"`

### Type Definitions

- **Interfaces:** Use for object shapes and contracts
- **Types:** Use for unions, intersections, primitives
- **Enums:** Use for fixed sets of values (e.g., UserRole, SubscriptionStatus)
- **DTOs:** Use classes with class-validator decorators

### File Extensions

- **Source Files:** `.ts` (TypeScript)
- **Test Files:** `.spec.ts` (unit tests), `.e2e-spec.ts` (E2E tests)
- **Configuration:** `.json`, `.mjs`, `.cjs`
- **Templates:** `.md` (documentation)

## NestJS Conventions

### Module Structure

Each module follows this pattern:

```typescript
@Module({
  imports: [/* dependent modules */],
  controllers: [/* controllers */],
  providers: [/* services, providers */],
  exports: [/* exported providers */],
})
export class ModuleName {}
```

### Controller Conventions

- **Route Prefix:** Set via `@Controller('prefix')` decorator
- **HTTP Methods:** Use appropriate decorators (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`)
- **Path Parameters:** `@Param('id')` decorator
- **Query Parameters:** `@Query()` decorator
- **Request Body:** `@Body()` decorator with DTO validation
- **Response Codes:** Use `@HttpCode()` for non-standard codes
- **Headers:** Use `@Header()` decorator for custom headers

**Example:**

```typescript
@Controller('offers')
export class OfferController {
  @Get()
  findAll(@Query() query: FindOffersDto) {
    return this.offerService.findAll(query);
  }

  @Post()
  create(@Body() createOfferDto: CreateOfferDto) {
    return this.offerService.create(createOfferDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.offerService.findOne(id);
  }
}
```

### Service Conventions

- **Dependency Injection:** Constructor injection with private readonly properties
- **Async Methods:** Use `async/await` for database operations
- **Error Handling:** Throw appropriate HttpException or custom exceptions
- **Return Types:** Explicitly typed return values

**Example:**

```typescript
@Injectable()
export class OfferService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(query: FindOffersDto): Promise<Offer[]> {
    return this.prisma.offer.findMany({
      where: query.toWhere(),
      include: { merchant: true, category: true },
    });
  }
}
```

### DTO Conventions

- **Validation:** Use class-validator decorators
- **Transformation:** Use class-transformer decorators
- **Nesting:** Support nested DTOs for complex objects
- **Partial Updates:** Use `PartialType` for update DTOs

**Common Decorators:**
- `@IsString()`, `@IsNumber()`, `@IsBoolean()`
- `@IsEmail()`, `@IsUUID()`, `@IsUrl()`
- `@IsOptional()`, `@IsNotEmpty()`
- `@Min()`, `@Max()`, `@MinLength()`, `@MaxLength()`
- `@IsEnum()`, `@IsArray()`
- `@Type(() => Type)` for type transformation

**Example:**

```typescript
export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  estimatedSavingsNpr: number;

  @IsEnum(OfferCategory)
  category: OfferCategory;
}
```

## Naming Conventions

### Files and Directories

- **Kebab-case:** Files and directories (e.g., `auth.service.ts`, `user-profile.dto.ts`)
- **PascalCase:** Classes and interfaces (e.g., `AuthService`, `UserProfileDto`)
- **camelCase:** Variables, functions, methods (e.g., `userId`, `findAllOffers`)
- **SCREAMING_SNAKE_CASE:** Constants and environment variables (e.g., `API_KEY`, `DATABASE_URL`)

### Database

- **snake_case:** Database columns and tables (e.g., `user_id`, `created_at`)
- **PascalCase:** Prisma models (e.g., `User`, `Offer`)
- **Enum Values:** SCREAMING_SNAKE_CASE (e.g., `USER`, `MERCHANT_ADMIN`)

### API Endpoints

- **Kebab-case:** Route paths (e.g., `/api/v1/user-profiles`, `/api/v1/offer-categories`)
- **camelCase:** Query parameters (e.g., `?sortBy=createdAt`, `?filterBy=category`)

## Code Style

### Formatting

- **Tool:** Prettier with `.prettierrc` configuration
- **Indentation:** 2 spaces
- **Quotes:** Single quotes
- **Semicolons:** Required
- **Trailing Commas:** ES5 (objects, arrays)
- **Line Width:** 80 characters (soft limit)

### Linting

- **Tool:** ESLint with TypeScript support
- **Config:** `eslint.config.mjs`
- **Rules:** Standard NestJS rules + Prettier integration
- **Auto-fix:** Run `pnpm run lint` to auto-fix issues

### Import Order

1. Node.js built-in modules
2. External packages (@nestjs, ...)
3. Internal modules (relative imports)
4. Type imports (if separated)

**Example:**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
```

## Error Handling

### Exception Types

- **HttpException:** Standard HTTP errors (400, 404, 500, etc.)
- **BadRequestException:** Invalid input (400)
- **UnauthorizedException:** Authentication required (401)
- **ForbiddenException:** Insufficient permissions (403)
- **NotFoundException:** Resource not found (404)
- **ConflictException:** Resource conflict (409)
- **UnprocessableEntityException:** Validation failed (422)
- **InternalServerErrorException:** Server error (500)

### Error Response Format

All errors follow RFC 7807 format via `AllExceptionsFilter`:

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

### Custom Error Codes

Defined in `src/common/constants/error-codes.ts`:
- Use standardized error codes for consistency
- Map error codes to HTTP status codes
- Include user-friendly messages

## Logging Conventions

### Logger Usage

- **Library:** Pino via nestjs-pino
- **Injection:** Inject `Logger` from nestjs-pino
- **Context:** Include correlation ID in all logs
- **Levels:** error, warn, info, debug

**Example:**

```typescript
@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  async create(dto: CreateOfferDto) {
    this.logger.log(`Creating offer: ${dto.title}`);
    try {
      const offer = await this.prisma.offer.create({ data: dto });
      this.logger.log(`Offer created: ${offer.id}`);
      return offer;
    } catch (error) {
      this.logger.error(`Failed to create offer: ${error.message}`);
      throw error;
    }
  }
}
```

### Log Levels

- **error:** Errors that require attention
- **warn:** Warning conditions that don't stop execution
- **info:** Informational messages (important events)
- **debug:** Detailed debugging information (development only)

## Database Conventions

### Prisma Usage

- **Service:** Inject `PrismaService` in modules
- **Queries:** Use Prisma Client API
- **Transactions:** Use `$transaction` for multi-step operations
- **Relations:** Use `include` for eager loading
- **Pagination:** Use `skip` and `take` for pagination

**Example:**

```typescript
async findAll(page: number, limit: number) {
  return this.prisma.offer.findMany({
    skip: (page - 1) * limit,
    take: limit,
    include: { merchant: true, category: true },
    orderBy: { createdAt: 'desc' },
  });
}
```

### Migration Conventions

- **Naming:** Descriptive migration names (e.g., `add_user_table`)
- **Order:** Run migrations in sequence
- **Rollback:** Provide rollback SQL if needed
- **Seed:** Use `prisma/seed.ts` for initial data

## Security Conventions

### Authentication

- **JWT:** Use JWT tokens for stateless auth
- **Secrets:** Store in environment variables, never in code
- **Expiration:** Set reasonable token expiration times
- **Refresh:** Implement refresh token rotation

### Authorization

- **Guards:** Use `@Roles()` decorator with `RolesGuard`
- **Public Routes:** Mark with `@Public()` decorator
- **API Keys:** Use `@RequireApiKey()` for M2M endpoints

### Input Validation

- **DTOs:** Always validate input via class-validator
- **Sanitization:** Strip unknown fields via ValidationPipe whitelist
- **SQL Injection:** Use Prisma parameterized queries (safe by default)
- **XSS:** Escape user-generated content

### Output Sanitization

- **Passwords:** Never log or return passwords
- **Tokens:** Never log or return full tokens
- **Sensitive Data:** Redact in logs (e.g., `***REDACTED***`)

## API Conventions

### RESTful Design

- **Resources:** Use plural nouns (`/offers`, `/categories`)
- **HTTP Methods:** Use semantically correct methods
- **Status Codes:** Return appropriate HTTP status codes
- **Versioning:** Use URI versioning (`/api/v1/`)

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

**Error Response:** RFC 7807 format (see Error Handling)

### Pagination

- **Query Params:** `page` (1-based), `limit` (default: 10, max: 100)
- **Response:** Include `meta` with pagination info
- **Links:** Include `prev`, `next` links (optional)

## Testing Conventions

### Unit Tests

- **Location:** Co-located with source files (`.spec.ts`)
- **Framework:** Jest
- **Naming:** `describe` for feature, `it` for behavior
- **Assertions:** Use Jest matchers

**Example:**

```typescript
describe('OfferService', () => {
  it('should create an offer', async () => {
    const dto = new CreateOfferDto();
    const result = await service.create(dto);
    expect(result).toHaveProperty('id');
  });
});
```

### E2E Tests

- **Location:** `test/` directory
- **Framework:** Jest with supertest
- **Coverage:** Test critical user flows
- **Cleanup:** Clean up database after tests

## Comment Conventions

### JSDoc

- **Purpose:** Document public APIs
- **Format:** Standard JSDoc syntax
- **Required:** For complex functions and public methods

**Example:**

```typescript
/**
 * Creates a new offer
 * @param dto - Offer creation data
 * @returns Created offer with ID
 * @throws BadRequestException if validation fails
 */
async create(dto: CreateOfferDto): Promise<Offer> {
  // ...
}
```

### Inline Comments

- **Purpose:** Explain non-obvious logic
- **Style:** Single-line `//` comments
- **Placement:** Above the code being explained
- **Avoid:** Commenting obvious code

## Git Conventions

### Commit Messages

- **Format:** Conventional Commits
- **Types:** feat, fix, docs, style, refactor, test, chore
- **Examples:**
  - `feat(auth): add Google OAuth support`
  - `fix(offer): resolve pagination bug`
  - `docs(readme): update setup instructions`

### Branch Naming

- **Format:** `type/description`
- **Types:** feature, fix, hotfix, refactor
- **Examples:**
  - `feature/add-google-oauth`
  - `fix/redemption-bug`
  - `refactor/prisma-queries`

## Performance Conventions

### Database Queries

- **Selectivity:** Only select required fields
- **Indexes:** Use indexed columns in WHERE clauses
- **N+1:** Avoid N+1 queries with proper includes
- **Pagination:** Always paginate list endpoints

### Caching

- **Strategy:** Cache frequently accessed data
- **TTL:** Set appropriate cache expiration
- **Invalidation:** Invalidate cache on data changes
- **Redis:** Use Redis for distributed caching

### Async Operations

- **Non-blocking:** Use async/await for I/O operations
- **Parallel:** Use `Promise.all()` for independent operations
- **Timeouts:** Set timeouts for external service calls

## Documentation Conventions

### Code Documentation

- **README.md:** Project overview and setup
- **Swagger:** API documentation at `/docs`
- **Comments:** Document complex logic
- **Types:** Use TypeScript types as documentation

### API Documentation

- **Swagger Decorators:** Use `@ApiTags`, `@ApiOperation`, `@ApiResponse`
- **Examples:** Provide request/response examples
- **Authentication:** Document auth requirements
- **Error Responses:** Document error scenarios

---
*Codebase analysis: 2026-10-05*
