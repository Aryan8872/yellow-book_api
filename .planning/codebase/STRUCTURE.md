---
last_mapped_commit: 8d310acc40fa1a65d601fcb442dd154f984038ee
last_mapped_at: 2026-10-05
---

# Directory Structure

**Analysis Date:** 2026-10-05

## Root Directory

```
offernepal/
├── .dockerignore              # Docker build exclusions
├── .env                       # Environment variables (not committed)
├── .env.example               # Environment variable template
├── .git/                      # Git repository
├── .gitignore                 # Git ignore rules
├── .npmrc                     # npm/pnpm configuration
├── .planning/                 # GSD planning documents (this directory)
├── .prettierrc                # Prettier formatting rules
├── .windsurf/                 # Windsurf IDE configuration
│   ├── agents/                # GSD agent definitions
│   ├── gsd-core/              # GSD workflow engine
│   └── workflows/             # Custom workflows
├── Dockerfile                 # Multi-stage Docker build
├── docker-compose.yml         # Docker Compose configuration
├── docker-prisma-debug.patch  # Prisma debugging patch
├── eslint.config.mjs          # ESLint configuration
├── nest-cli.json              # NestJS CLI configuration
├── package.json               # Project dependencies and scripts
├── package-lock.json          # npm lock file (legacy)
├── pnpm-lock.yaml             # pnpm lock file (active)
├── pnpm-workspace.yaml        # pnpm workspace configuration
├── prisma/                    # Prisma ORM schema and migrations
│   ├── migrations/            # Database migration files
│   ├── schema.prisma          # Database schema definition
│   └── seed.ts                # Database seeding script
├── railway.json               # Railway deployment configuration
├── railway.toml               # Railway service definitions
├── README.md                  # Project documentation
├── src/                       # Source code
├── test/                      # Test files
├── tsconfig.build.json        # TypeScript build configuration
├── tsconfig.json              # TypeScript compiler configuration
├── uploads/                   # Local file storage (gitignored)
└── docs/                      # Additional documentation
```

## Source Directory (`src/`)

```
src/
├── app.controller.ts          # Root controller (health check placeholder)
├── app.controller.spec.ts     # Root controller tests
├── app.module.ts              # Root application module
├── app.service.ts             # Root service (placeholder)
├── main.ts                   # Application entry point
├── common/                   # Shared utilities and cross-cutting concerns
│   ├── constants/            # Application-wide constants
│   │   └── error-codes.ts    # Standardized error codes
│   ├── decorators/            # Custom parameter decorators
│   │   ├── correlation-id.decorator.ts
│   │   └── current-user.decorator.ts
│   ├── filters/              # Global exception filters
│   │   └── all-exceptions.filter.ts
│   ├── health/               # Health check endpoints
│   │   └── health.controller.ts
│   ├── interceptors/         # Response transformation and middleware
│   │   ├── idempotency.interceptor.ts
│   │   ├── metrics.interceptor.ts
│   │   └── transform-response.interceptor.ts
│   ├── middlewares/          # Express middlewares
│   │   └── correlation-id.middleware.ts
│   ├── pipes/                # Custom validation pipes
│   │   └── validation.pipe.ts
│   └── throttler/            # Rate limiting utilities
│       └── throttler-storage-redis.service.ts
├── infrastructure/           # External service integrations
│   ├── metrics/              # Prometheus metrics
│   │   ├── metrics.controller.ts
│   │   ├── metrics.module.ts
│   │   └── metrics.service.ts
│   ├── prisma/               # Database ORM
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   └── redis/                # Redis caching
│       ├── distributed-lock.service.ts
│       ├── redis.constants.ts
│       ├── redis.module.ts
│       └── redis.service.ts
└── modules/                  # Domain modules
    ├── auth/                 # Authentication module
    │   ├── auth.constants.ts
    │   ├── auth.controller.ts
    │   ├── auth.decorators.ts
    │   ├── auth.module.ts
    │   ├── auth.service.ts
    │   ├── auth.types.ts
    │   ├── auth.utils.ts
    │   ├── dto/              # Data transfer objects
    │   │   └── auth.dto.ts
    │   ├── guards/           # Auth guards
    │   │   ├── api-key.guard.ts
    │   │   ├── jwt-auth.guard.ts
    │   │   └── roles.guard.ts
    │   └── strategies/       # Passport strategies
    │       ├── google.strategy.ts
    │       ├── jwt.strategy.ts
    │       └── local.strategy.ts
    ├── category/             # Category module
    │   ├── category.controller.ts
    │   ├── category.module.ts
    │   ├── category.service.ts
    │   └── dto/
    │       └── category.dto.ts
    ├── offer/                # Offer module
    │   ├── offer.constants.ts
    │   ├── offer.controller.ts
    │   ├── offer.module.ts
    │   ├── offer.service.ts
    │   ├── offer.utils.ts
    │   └── dto/
    │       └── offer.dto.ts
    ├── redemption/           # Redemption module
    │   ├── redemption.constants.ts
    │   ├── redemption.controller.ts
    │   ├── redemption.module.ts
    │   ├── redemption.service.ts
    │   ├── redemption.utils.ts
    │   └── dto/
    │       └── redemption.dto.ts
    └── upload/               # File upload module
        ├── upload.controller.ts
        ├── upload.interface.ts
        ├── upload.module.ts
        ├── upload.service.ts
        └── providers/
            └── cloudinary.provider.ts
```

## Test Directory (`test/`)

```
test/
├── app.e2e-spec.ts           # End-to-end tests
└── jest-e2e.json             # Jest E2E configuration
```

## Prisma Directory (`prisma/`)

```
prisma/
├── migrations/               # Database migration history
│   └── [timestamp]_migration_name/
│       └── migration.sql
├── schema.prisma             # Database schema definition
└── seed.ts                   # Database seeding script
```

## Key File Locations

### Entry Points

- **Application Bootstrap:** `src/main.ts`
- **Root Module:** `src/app.module.ts`
- **API Documentation:** `/docs` (Swagger UI, configured in `main.ts`)
- **Health Check:** `/health` (configured in `src/common/health/`)
- **Metrics:** `/metrics` (Prometheus endpoint)

### Configuration

- **Environment Variables:** `.env` (local), Railway dashboard (production)
- **TypeScript Config:** `tsconfig.json`, `tsconfig.build.json`
- **NestJS Config:** `nest-cli.json`
- **ESLint Config:** `eslint.config.mjs`
- **Prettier Config:** `.prettierrc`
- **Package Config:** `package.json`, `pnpm-workspace.yaml`

### Database

- **Schema:** `prisma/schema.prisma`
- **Migrations:** `prisma/migrations/`
- **Seed Data:** `prisma/seed.ts`
- **Prisma Service:** `src/infrastructure/prisma/prisma.service.ts`

### Authentication

- **Auth Service:** `src/modules/auth/auth.service.ts`
- **Auth Controller:** `src/modules/auth/auth.controller.ts`
- **Guards:** `src/modules/auth/guards/`
- **Strategies:** `src/modules/auth/strategies/`

### Domain Modules

Each domain module follows this structure:

```
module-name/
├── module-name.controller.ts  # HTTP endpoints
├── module-name.service.ts     # Business logic
├── module-name.module.ts      # Module definition
├── module-name.constants.ts   # Module-specific constants
├── module-name.utils.ts       # Helper functions
├── module-name.types.ts       # TypeScript types/interfaces
└── dto/                       # Data transfer objects
    └── module-name.dto.ts
```

### Infrastructure

- **Prisma:** `src/infrastructure/prisma/`
- **Redis:** `src/infrastructure/redis/`
- **Metrics:** `src/infrastructure/metrics/`

### Common Utilities

- **Error Handling:** `src/common/filters/all-exceptions.filter.ts`
- **Validation:** `src/common/pipes/validation.pipe.ts`
- **Interceptors:** `src/common/interceptors/`
- **Middlewares:** `src/common/middlewares/`
- **Decorators:** `src/common/decorators/`
- **Constants:** `src/common/constants/error-codes.ts`

## Naming Conventions

### Files

- **Controllers:** `{module}.controller.ts`
- **Services:** `{module}.service.ts`
- **Modules:** `{module}.module.ts`
- **DTOs:** `{module}.dto.ts` (in `dto/` subdirectory)
- **Guards:** `{guard}.guard.ts`
- **Strategies:** `{provider}.strategy.ts`
- **Interceptors:** `{purpose}.interceptor.ts`
- **Filters:** `{purpose}.filter.ts`
- **Pipes:** `{purpose}.pipe.ts`
- **Middlewares:** `{purpose}.middleware.ts`
- **Decorators:** `{purpose}.decorator.ts`
- **Constants:** `{module}.constants.ts`
- **Types:** `{module}.types.ts`
- **Utilities:** `{module}.utils.ts`

### Directories

- **Modules:** `src/modules/{module-name}/`
- **Infrastructure:** `src/infrastructure/{service}/`
- **Common:** `src/common/{category}/`
- **DTOs:** `{module}/dto/`
- **Guards:** `{module}/guards/`
- **Strategies:** `{module}/strategies/`

## Module Dependencies

### Import Hierarchy

```
main.ts
  └─> app.module.ts
       ├─> ConfigModule (global)
       ├─> LoggerModule (global)
       ├─> ThrottlerModule (global)
       ├─> RedisModule
       ├─> PrismaModule
       ├─> MetricsModule
       ├─> AuthModule
       │    └─> PrismaModule (transitive)
       ├─> RedemptionModule
       │    └─> PrismaModule (transitive)
       ├─> OfferModule
       │    └─> PrismaModule (transitive)
       ├─> CategoryModule
       │    └─> PrismaModule (transitive)
       └─> UploadModule
            └─> Cloudinary (external)
```

### Circular Dependency Prevention

- Infrastructure modules (Prisma, Redis, Metrics) are independent
- Domain modules depend on infrastructure, not on each other
- Common layer has no dependencies on domain modules
- Guards and strategies are self-contained within AuthModule

## Build Output

```
dist/
└── src/
    ├── main.js               # Compiled entry point
    ├── app.module.js         # Compiled root module
    ├── common/               # Compiled common utilities
    ├── infrastructure/       # Compiled infrastructure
    └── modules/              # Compiled domain modules
```

## Static Assets

```
uploads/                      # Local file storage (gitignored)
├── images/                   # Uploaded images
└── documents/                # Uploaded documents
```

Served at `/uploads/` prefix (configured in `src/main.ts`)

## GSD Planning Directory

```
.planning/
└── codebase/                 # Codebase mapping documents
    ├── STACK.md              # Tech stack
    ├── INTEGRATIONS.md       # External integrations
    ├── ARCHITECTURE.md       # System architecture
    ├── STRUCTURE.md          # Directory structure (this file)
    ├── CONVENTIONS.md        # Code conventions
    ├── TESTING.md            # Testing practices
    └── CONCERNS.md           # Technical debt and issues
```

## Deployment Artifacts

- **Dockerfile:** Multi-stage build for production
- **docker-compose.yml:** Local development orchestration
- **railway.json:** Railway project configuration
- **railway.toml:** Railway service definitions

## Configuration Files

- **.dockerignore:** Files excluded from Docker build
- **.gitignore:** Files excluded from Git
- **.npmrc:** npm/pnpm registry and configuration
- **.prettierrc:** Code formatting rules
- **eslint.config.mjs:** Linting rules

## Documentation

- **README.md:** Project overview and setup instructions
- **Swagger Docs:** Interactive API documentation at `/docs`
- **Codebase Docs:** This directory (`.planning/codebase/`)

---
*Codebase analysis: 2026-10-05*
