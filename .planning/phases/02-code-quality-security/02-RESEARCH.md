# Phase 2: Code Quality & Security - Research

**Created:** 2026-10-05
**Phase:** 2 - Code Quality & Security

## User Constraints

None - this is a technical debt phase with no user decisions locked.

## Phase Requirements

None - technical debt cleanup.

## Standard Stack

### Testing Framework
- **Jest** - Already configured in package.json
- **@nestjs/testing** - Already installed for NestJS module testing
- **ts-jest** - TypeScript Jest transformer (already configured)
- **supertest** - HTTP assertion library (already installed)

### Type Safety
- **TypeScript 5.7.3** - Current version in package.json
- **@typescript-eslint/eslint-plugin** - ESLint TypeScript rules (already installed)
- **strict mode** - Enabled in tsconfig.json

### Security
- **class-validator** - Input validation (already used)
- **class-transformer** - DTO transformation (already used)
- **helmet** - Security headers (already configured in app.module.ts)
- **NestJS Guards** - Already used for auth and roles

## Architecture Patterns

### Type Safety Improvements

**Pattern 1: Replace `(req as any).user` with `@CurrentUser()` decorator**

Current pattern in codebase:
```typescript
const user = (req as any).user as AuthenticatedUser;
```

Recommended NestJS pattern:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

Usage:
```typescript
@Get()
async getProfile(@CurrentUser() user: AuthenticatedUser) {
  return user;
}
```

**Evidence:** NestJS official documentation on custom decorators

**Pattern 2: Extract merchant ownership check to shared guard**

Current pattern - repeated in service methods:
```typescript
if (user.role === UserRole.MERCHANT_STAFF || user.role === UserRole.MERCHANT_ADMIN) {
  if (user.merchantId !== merchantId) {
    throw new ForbiddenException('Access denied');
  }
}
```

Recommended pattern - custom guard:
```typescript
@Injectable()
export class MerchantOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const merchantId = request.params.merchantId || request.body.merchantId;
    
    if (user.role === UserRole.ADMIN) return true;
    if (user.merchantId === merchantId) return true;
    
    throw new ForbiddenException('Access denied');
  }
}
```

**Evidence:** NestJS Guards documentation

### Error Handling Security

**Pattern: Sanitize error messages**

Current issue - potential exposure of internal details:
```typescript
throw new NotFoundException(`Offer with ID ${id} not found`);
```

Recommended pattern - generic messages for client errors:
```typescript
throw new NotFoundException('Resource not found');
```

For debugging, use logging:
```typescript
this.logger.warn(`Offer not found: ${id}`);
throw new NotFoundException('Resource not found');
```

**Evidence:** OWASP guidelines on error handling

## Testing Patterns

### Unit Testing with NestJS

**Pattern 1: Service testing**
```typescript
describe('MerchantService', () => {
  let service: MerchantService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MerchantService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MerchantService>(MerchantService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create a merchant', async () => {
    const result = await service.createMerchant(dto, user);
    expect(result).toHaveProperty('id');
  });
});
```

**Pattern 2: Controller testing**
```typescript
describe('MerchantController', () => {
  let controller: MerchantController;
  let service: MerchantService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MerchantController],
      providers: [
        {
          provide: MerchantService,
          useValue: mockMerchantService,
        },
      ],
    }).compile();

    controller = module.get<MerchantController>(MerchantController);
    service = module.get<MerchantService>(MerchantService);
  });

  it('should create a merchant', async () => {
    const result = await controller.createMerchant(dto, mockUser);
    expect(result).toEqual(expectedMerchant);
  });
});
```

**Evidence:** NestJS Testing documentation

### Mocking Prisma

**Pattern: Mock PrismaService**
```typescript
const mockPrismaService = {
  merchant: {
    create: jest.fn().mockResolvedValue(mockMerchant),
    findUnique: jest.fn().mockResolvedValue(mockMerchant),
    update: jest.fn().mockResolvedValue(updatedMerchant),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(mockUser),
  },
};
```

**Evidence:** NestJS documentation on mocking providers

## Common Pitfalls

### Type Safety Pitfalls

1. **Using `as any` excessively** - Undermines TypeScript's type checking
   - Fix: Create proper type guards or custom decorators

2. **Optional chaining on required fields** - Can hide null reference errors
   - Fix: Use definite assignment assertion or initialize in constructor

3. **Ignoring `any` in ESLint** - Can lead to runtime errors
   - Fix: Enable `@typescript-eslint/no-explicit-any` rule

### Security Pitfalls

1. **Exposing internal IDs in error messages** - Information disclosure
   - Fix: Use generic error messages for client-facing responses

2. **Not validating input types** - Can lead to injection attacks
   - Fix: Always use class-validator on DTOs

3. **Missing rate limiting on sensitive endpoints** - Brute force attacks
   - Fix: Already handled by @nestjs/throttler globally

### Testing Pitfalls

1. **Testing implementation details** - Brittle tests
   - Fix: Test behavior, not implementation

2. **Not mocking external dependencies** - Slow tests
   - Fix: Mock Prisma, Redis, and external APIs

3. **Test database pollution** - Tests affecting each other
   - Fix: Use transaction rollback or clean database per test

## Code Examples

### Example: Custom @CurrentUser Decorator

```typescript
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
```

### Example: Merchant Ownership Guard

```typescript
// src/modules/merchant/guards/merchant-ownership.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class MerchantOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const merchantId = request.params.merchantId || request.body.merchantId;

    // Admins can access any merchant
    if (user.role === UserRole.ADMIN) return true;

    // Merchant users can only access their own merchant
    if (user.merchantId === merchantId) return true;

    throw new ForbiddenException('Access denied');
  }
}
```

### Example: Unit Test for Service

```typescript
// src/modules/merchant/merchant.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('MerchantService', () => {
  let service: MerchantService;
  let prisma: PrismaService;

  const mockPrismaService = {
    merchant: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    merchantBranch: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MerchantService>(MerchantService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMerchant', () => {
    it('should create a merchant', async () => {
      const dto = { name: 'Test Merchant' };
      const user = { id: 'user-1', role: UserRole.ADMIN };
      const expected = { id: 'merchant-1', ...dto, status: 'PENDING_REVIEW' };

      mockPrismaService.merchant.create.mockResolvedValue(expected);

      const result = await service.createMerchant(dto, user);

      expect(result).toEqual(expected);
      expect(mockPrismaService.merchant.create).toHaveBeenCalledWith({
        data: { ...dto, status: 'PENDING_REVIEW' },
      });
    });
  });
});
```

## Environment Availability

### Development Environment
- **Node.js** - Required (already in use)
- **pnpm** - Package manager (already in use)
- **PostgreSQL** - Database (already running)
- **Redis** - Cache (optional for tests, can be mocked)

### Test Environment
- **Jest** - Test runner (already configured)
- **No additional infrastructure needed** - All tests can be unit tests with mocks

## State of the Art Updates

### NestJS Testing Best Practices (2024)
- Use `Test.createTestingModule` for isolated testing
- Mock external dependencies (Prisma, Redis)
- Use `jest.mock()` for module mocking
- Keep tests fast with pure unit tests, use integration tests sparingly

### TypeScript Strict Mode
- Enable `strict: true` in tsconfig.json (already enabled)
- Use `noImplicitAny: true` (already enabled)
- Use `strictNullChecks: true` (already enabled)

### Security Best Practices (OWASP 2024)
- Never expose stack traces to clients
- Validate all input at the boundary (DTOs)
- Use parameterized queries (Prisma handles this)
- Implement rate limiting (already done globally)

## Open Questions

None - all patterns are well-documented in NestJS ecosystem.

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Jest and NestJS testing are mature, well-documented |
| Architecture | HIGH | Decorator and guard patterns are standard NestJS |
| Pitfalls | HIGH | Common TypeScript and security pitfalls well-known |
| Testing | HIGH | NestJS testing patterns are established and documented |

## Ready for Planning

Research complete. All patterns are standard NestJS practices with high confidence. Planner can create detailed plans for:
1. Type safety improvements (replace `as any`, add decorators)
2. Security improvements (error sanitization, shared guards)
3. Test coverage (unit tests for redemption, auth, offer modules)
