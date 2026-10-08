---
last_mapped_commit: 8d310acc40fa1a65d601fcb442dd154f984038ee
last_mapped_at: 2026-10-05
---

# Tech Stack

**Analysis Date:** 2026-10-05

## Core Framework

- **NestJS** v11.0.1 - Progressive Node.js framework for building efficient server-side applications
- **TypeScript** v5.7.3 - Type-safe JavaScript superset
- **Node.js** v20 - Runtime environment (Alpine-based Docker image)

## Database & ORM

- **PostgreSQL** - Primary relational database (hosted on Railway)
- **Prisma** v5.16.2 - Type-safe ORM for database access and schema management
  - Client: `@prisma/client`
  - Schema: `prisma/schema.prisma`
  - Migrations: `prisma/migrations/`

## Authentication & Security

- **Passport.js** v0.7.0 - Authentication middleware
  - `passport-jwt` v4.0.1 - JWT token strategy
  - `passport-local` v1.0.0 - Local email/password strategy
  - `passport-google-oauth20` v2.0.0 - Google OAuth 2.0
- **@nestjs/jwt** v12.0.2 - JWT token generation and validation
- **@nestjs/passport** v12.0.0 - Passport integration for NestJS
- **bcrypt** v6.0.0 - Password hashing
- **helmet** v8.3.0 - Security headers middleware

## Caching & Rate Limiting

- **ioredis** v6.0.0 - Redis client for caching and distributed operations
- **@nestjs/throttler** v6.7.1 - Rate limiting middleware with Redis-backed storage

## File Storage

- **Cloudinary** v2.11.0 - Cloud-based image and file storage
- **multer** (via `@types/multer`) - File upload handling (multipart/form-data)

## API Documentation

- **@nestjs/swagger** v12.0.2 - OpenAPI/Swagger documentation generation
- Swagger UI available at `/docs` endpoint

## Logging & Monitoring

- **nestjs-pino** v5.2.1 - Structured logging with Pino
- **pino** v10.3.1 - Fast JSON logger
- **pino-http** v11.0.0 - HTTP request logging
- **pino-pretty** v13.1.3 - Pretty-printed logs for development
- **prom-client** v15.1.3 - Prometheus metrics collection

## Validation & Transformation

- **class-validator** v0.15.1 - DTO validation using decorators
- **class-transformer** v0.5.1 - Object transformation and serialization

## HTTP & Compression

- **compression** v1.8.2 - Gzip/Brotli response compression
- **@nestjs/platform-express** v11.0.1 - Express platform adapter

## Configuration

- **@nestjs/config** v12.0.1 - Environment configuration management
- **dotenv** (via @nestjs/config) - Environment variable loading

## Development Tools

- **@nestjs/cli** v11.0.0 - NestJS CLI for scaffolding and building
- **ts-node** v10.9.2 - TypeScript execution
- **ts-loader** v9.5.2 - Webpack TypeScript loader
- **tsconfig-paths** v4.2.0 - Path mapping resolution

## Testing

- **Jest** v30.0.0 - Testing framework
- **@nestjs/testing** v11.0.1 - NestJS testing utilities
- **supertest** v7.0.0 - HTTP assertion library for endpoint testing
- **ts-jest** v29.2.5 - TypeScript preprocessor for Jest

## Code Quality

- **ESLint** v9.18.0 - Linting and code quality
- **Prettier** v3.4.2 - Code formatting
- **eslint-config-prettier** v10.0.1 - ESLint/Prettier integration
- **eslint-plugin-prettier** v5.2.2 - Prettier rules in ESLint

## Build & Deployment

- **pnpm** - Fast, disk space efficient package manager
- **Docker** - Containerization (multi-stage build with Alpine Linux)
- **Railway** - Cloud deployment platform (PostgreSQL, Redis hosting)

## Utilities

- **uuid** v14.0.2 - UUID generation
- **reflect-metadata** v0.2.2 - Decorator metadata reflection (required for NestJS)
- **rxjs** v7.8.1 - Reactive extensions for JavaScript

## TypeScript Configuration

- **Target:** ES2023
- **Module:** nodenext
- **Module Resolution:** nodenext
- **Decorators:** Enabled (experimentalDecorators, emitDecoratorMetadata)
- **Strict Mode:** Partial (strictNullChecks enabled, noImplicitAny disabled)
- **Output:** `./dist` directory

## Package Manager

- **pnpm** with workspace support (`pnpm-workspace.yaml`)
- **.npmrc** configuration present
- **Lock file:** `pnpm-lock.yaml`

## Environment Variables

Key environment variables (see `.env.example`):
- `NODE_ENV`, `PORT`, `LOG_LEVEL`
- `DATABASE_URL` (PostgreSQL)
- `REDIS_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `CORS_ALLOWED_ORIGINS`
- `STORAGE_DRIVER` (local/cloudinary)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

---
*Codebase analysis: 2026-10-05*
