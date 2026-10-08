# Phase 3: Admin Module - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

## Phase Boundary

Building admin management features: dedicated admin module with controller, service, and guards; merchant approval workflow (approve/reject with audit logging); user management for admins (list, suspend, activate users, view details); fraud review interface (list, confirm/dismiss fraud flags with severity levels); payout/settlement management (depends on Phase 4); basic admin stats (total merchants, pending approvals, total users, active offers); health and metrics endpoints.

## Implementation Decisions

### Admin User Creation
- **D-01:** Admin users created via both database seed AND special endpoint — seed for initial setup, endpoint for adding admins later — **Reversibility:** reversible — both methods can coexist, endpoint can be removed if needed
- **D-02:** Admin creation endpoint requires existing admin authentication (self-service admin creation not allowed) — **Reversibility:** reversible — guard can be removed

### Merchant Creation
- **D-03:** Merchants can self-register (existing flow from Phase 1) AND admin can add merchants manually through admin panel — dual paths for merchant onboarding — **Reversibility:** reversible — admin manual add can be removed if not needed

### Audit Logging
- **D-04:** Audit log retention: 1 year with auto-purge, configurable via environment variable `AUDIT_LOG_RETENTION_DAYS` (default: 365) — balances compliance and storage — **Reversibility:** reversible — retention policy can be changed via config

### Fraud Flags
- **D-05:** Add severity field to FraudFlag model (enum: LOW, MEDIUM, HIGH) — helps admins prioritize review — **Reversibility:** costly — schema change requires migration
- **D-06:** Defer fraud detection logic to later phases (app is free for first year, fraud detection not priority) — only create review endpoints now — **Reversibility:** reversible — detection logic can be added later

### Admin Operations
- **D-07:** Single actions only for admin operations (approve/reject merchants, suspend/activate users) — no bulk operations — simpler implementation, avoids partial failure complexity — **Reversibility:** reversible — bulk operations can be added later

### Admin Stats
- **D-08:** Basic admin stats include: total merchants, pending approvals, total users, active offers — simple counts for admin overview — **Reversibility:** reversible — stats can be added/removed
- **D-09:** Add health and metrics endpoints to admin module — `/health` for system health, `/metrics` for Prometheus metrics — **Reversibility:** reversible — endpoints can be removed if not needed

### Claude's Discretion
None — all decisions explicitly specified by user.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Business Logic
- `docs/business_logic.md` — Core subscription and redemption mechanics, dual-key flow, fraud detection heuristics

### Codebase Maps
- `.planning/codebase/STACK.md` — Tech stack (NestJS, Prisma, Redis, PostgreSQL, Passport, etc.)
- `.planning/codebase/ARCHITECTURE.md` — Layered modular architecture, module structure, authentication flow, redemption flow, security architecture
- `.planning/codebase/INTEGRATIONS.md` — PostgreSQL via Prisma, Redis for caching/locking, Google OAuth, Cloudinary, Railway deployment
- `.planning/codebase/CONVENTIONS.md` — NestJS conventions, DTO patterns, error handling, security conventions

### Project Documents
- `.planning/PROJECT.md` — Project overview, core value, business context, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements with traceability to phases (ADMN-01 through ADMN-04)
- `.planning/ROADMAP.md` — Phase breakdown and deliverables

### Existing Code Patterns
- `src/modules/auth/` — Authentication patterns, guards, strategies, decorators (reference for admin module structure)
- `src/modules/offer/` — Existing CRUD patterns, DTOs, service layer (reference for admin CRUD)
- `src/modules/redemption/` — Current redemption flow, code generation, distributed locking
- `src/common/decorators/` — Custom decorator patterns (for @CurrentUser, @AdminOnly)
- `src/modules/auth/guards/` — Guard patterns (JwtAuthGuard, RolesGuard — reference for AdminOnlyGuard)

### Database Schema
- `prisma/schema.prisma` — User, Merchant, Offer, RedemptionSession models (to be extended with AuditLog, FraudFlag severity)

## Existing Code Insights

### Reusable Assets
- `JwtAuthGuard`, `RolesGuard` — Authentication and authorization guards for admin endpoints
- `@CurrentUser()` decorator — For type-safe user injection in admin operations
- `@Roles(UserRole.ADMIN)` decorator — For role-based access control
- `PrismaService` — Database access singleton
- `RedisModule` / `DistributedLockService` — For distributed locking if needed
- `MetricsService` — Prometheus metrics collection (for metrics endpoint)
- `AllExceptionsFilter` — Global error handling with RFC 7807 format

### Established Patterns
- Module structure: controller → service → DTOs → types (follow NestJS conventions)
- Role-based access control: `@Roles(UserRole.ADMIN)` decorator with `RolesGuard`
- DTO validation: class-validator decorators with ValidationPipe
- Error handling: AppErrorCode enum for standardized error codes
- Repository pattern: PrismaService injected into services
- Audit logging pattern: Use Prisma transactions for atomic audit log writes

### Integration Points
- Auth module: Admin authentication via existing JWT flow
- Merchant module: Admin merchant management (approve/reject, manual creation)
- User module: Admin user management (suspend/activate)
- Redemption module: Fraud flag review (read-only access to fraud flags)
- Metrics module: Prometheus metrics for metrics endpoint

## Specific Ideas

- Admin seed script: Create initial admin user via `prisma/seed.ts` with environment variable for admin email/password
- Admin creation endpoint: POST `/api/v1/admin/users` with `@Roles(UserRole.ADMIN)` guard
- Manual merchant creation: Admin can create merchant account directly (bypasses self-registration flow)
- Audit log auto-purge: Scheduled job (cron) to delete audit logs older than retention period
- Health endpoint: `/health` returns database status, Redis status, overall system health
- Metrics endpoint: `/metrics` returns Prometheus metrics in text format

## Deferred Ideas

### Analytics Dashboard (new Phase 4)
Full analytics features deferred to dedicated Analytics phase:
- Redemption trends (day by day, week data for bar graph in Next.js admin panel)
- Most redeemed offers
- Trending merchants (whose offers have been claimed more)
- Merchant revenue analytics (revenue model: original price × redemption count, or fixed payout per redemption)
- Redemption summary by category (multi-series smooth line chart in NextJS)
- Configurable time ranges (last 7 days, last 30 days)
- Chart-ready data endpoints for Next.js admin panel

### Fraud Detection Logic
Fraud detection heuristics deferred to later phases (app is free for first year, fraud detection not priority). Only review endpoints created in this phase.

### Bulk Operations
Bulk approve/reject merchants, bulk suspend/activate users deferred to later phases (single actions only for now).

---

*Phase: 3-Admin Module*
*Context gathered: 2026-10-05*
