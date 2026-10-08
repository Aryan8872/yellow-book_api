---
last_mapped_commit: 8d310acc40fa1a65d601fcb442dd154f984038ee
last_mapped_at: 2026-10-05
---

# Testing

**Analysis Date:** 2026-10-05

## Testing Framework

### Jest

- **Framework:** Jest v30.0.0
- **NestJS Integration:** @nestjs/testing v11.0.1
- **TypeScript Support:** ts-jest v29.2.5
- **HTTP Testing:** supertest v7.0.0

### Configuration

**Jest Configuration** (`package.json`):

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node"
}
```

**E2E Configuration** (`test/jest-e2e.json`):
- Separate configuration for end-to-end tests
- Uses same Jest framework but different test environment

## Test Structure

### Unit Tests

**Location:** Co-located with source files
- Pattern: `{filename}.spec.ts`
- Example: `src/modules/auth/auth.service.spec.ts`

**Purpose:** Test individual functions and methods in isolation
- Mock external dependencies (Prisma, Redis, external APIs)
- Test business logic without HTTP layer
- Fast execution

### E2E Tests

**Location:** `test/` directory
- Pattern: `{filename}.e2e-spec.ts`
- Example: `test/app.e2e-spec.ts`

**Purpose:** Test complete request/response cycles
- Test HTTP endpoints via supertest
- Test integration between modules
- Slower execution but more realistic

## Test Scripts

### Available Scripts

```bash

# Run all unit tests

pnpm run test

# Run tests in watch mode

pnpm run test:watch

# Run tests with coverage

pnpm run test:cov

# Run tests in debug mode

pnpm run test:debug

# Run E2E tests

pnpm run test:e2e
```

## Testing Patterns

### Unit Test Pattern

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return JWT tokens for valid credentials', async () => {
      const result = await service.login(loginDto);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      await expect(service.login(invalidDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
```

### E2E Test Pattern

```typescript
describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('accessToken');
      });
  });
});
```

## Mocking Strategies

### Prisma Mocking

**Mock PrismaService:**

```typescript
const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
};
```

**Mock Return Values:**

```typescript
mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
mockPrismaService.user.create.mockResolvedValue(createdUser);
```

### Redis Mocking

**Mock RedisService:**

```typescript
const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
};
```

### External API Mocking

Use `jest.mock()` for external libraries:

```typescript
jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload: jest.fn().mockResolvedValue({ url: 'https://example.com/image.jpg' }),
    },
  },
}));
```

## Test Coverage

### Coverage Configuration

- **Collect From:** All TypeScript files in `src/`
- **Output Directory:** `coverage/`
- **Format:** HTML, JSON, LCov

### Coverage Goals

- **Statements:** 80%+
- **Branches:** 75%+
- **Functions:** 80%+
- **Lines:** 80%+

### Generating Coverage

```bash
pnpm run test:cov
```

View coverage report:
- Open `coverage/index.html` in browser

## Testing Best Practices

### Arrange-Act-Assert

```typescript
it('should create an offer', async () => {
  // Arrange
  const dto = new CreateOfferDto();
  dto.title = 'Test Offer';
  mockPrismaService.offer.create.mockResolvedValue(mockOffer);

  // Act
  const result = await service.create(dto);

  // Assert
  expect(result).toEqual(mockOffer);
  expect(mockPrismaService.offer.create).toHaveBeenCalledWith({
    data: dto,
  });
});
```

### Test Isolation

- Each test should be independent
- Use `beforeEach` to reset state
- Clean up database after tests
- Use test database if possible

### Descriptive Test Names

- **Good:** "should return 404 when offer not found"
- **Bad:** "test offer not found"

### Test Edge Cases

- Null/undefined values
- Empty arrays/objects
- Invalid input types
- Boundary conditions
- Error scenarios

## Integration Testing

### Database Testing

**Test Database:**
- Use separate test database
- Run migrations before tests
- Seed test data
- Clean up after tests

**Transaction Rollback:**
- Wrap tests in transactions
- Roll back after each test
- Keeps test database clean

### API Testing

**Supertest Usage:**

```typescript
return request(app.getHttpServer())
  .post('/api/v1/offers')
  .set('Authorization', `Bearer ${token}`)
  .send(createOfferDto)
  .expect(201)
  .expect((res) => {
    expect(res.body.data).toHaveProperty('id');
  });
```

## Current Test Coverage

### Existing Tests

**Unit Tests:**
- `src/app.controller.spec.ts` - Root controller tests

**E2E Tests:**
- `test/app.e2e-spec.ts` - Basic E2E test

### Coverage Gaps

**Missing Tests:**
- AuthService - No unit tests
- OfferService - No unit tests
- CategoryService - No unit tests
- RedemptionService - No unit tests
- UploadService - No unit tests
- All controllers - No unit tests
- Guards - No unit tests
- Interceptors - No unit tests
- Pipes - No unit tests
- Infrastructure services - No unit tests

**Recommendation:** Add comprehensive unit tests for all services and critical components

## Test Data Management

### Seed Data

**Location:** `prisma/seed.ts`
- Used for populating test database
- Contains sample users, offers, categories
- Run via `pnpm run seed`

### Test Fixtures

**Pattern:** Create reusable test data factories

```typescript
const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  ...overrides,
});
```

## Continuous Integration

### CI Testing

**Railway CI:**
- Tests run on deployment
- Failing tests block deployment
- Coverage reports generated

### Pre-commit Hooks (Recommended)

**Husky Setup:**

```bash
pnpm add -D husky lint-staged
npx husky install
```

**Pre-commit Hook:**

```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write",
      "jest --bail --findRelatedTests"
    ]
  }
}
```

## Debugging Tests

### Debug Mode

```bash
pnpm run test:debug
```

- Runs tests with Node.js debugger
- Attach Chrome DevTools
- Set breakpoints in tests

### Watch Mode

```bash
pnpm run test:watch
```

- Re-runs tests on file changes
- Faster feedback loop
- Useful during development

### Verbose Output

```bash
pnpm run test --verbose
```

- Shows detailed test output
- Helps identify failing tests

## Performance Testing

### Load Testing (Not Implemented)

**Recommended Tools:**
- Artillery
- k6
- JMeter

**Test Scenarios:**
- High concurrent user load
- Redemption endpoint stress test
- Database query performance

## Security Testing

### Security Tests (Not Implemented)

**Recommended Tools:**
- OWASP ZAP
- Snyk
- npm audit

**Test Areas:**
- SQL injection prevention
- XSS prevention
- CSRF protection
- Rate limiting effectiveness

## Testing Checklist

### Before Committing

- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Coverage meets threshold
- [ ] No console errors in tests
- [ ] Tests are isolated (no dependencies between tests)

### Before Release

- [ ] Full test suite passes
- [ ] Coverage report reviewed
- [ ] Performance tests run
- [ ] Security tests run
- [ ] Manual smoke tests completed

## Testing Resources

### Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

### Examples

- NestJS official examples
- Project-specific test patterns (to be added as tests are written)

---
*Codebase analysis: 2026-10-05*
