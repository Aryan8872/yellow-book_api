# Phase 1: Merchant Module & Location Features - Context

**Gathered:** Oct 5, 2026
**Status:** Ready for planning

## Phase Boundary

Building merchant management (dedicated module with CRUD, branches, PIN management, staff management), location-based offer filtering (GPS → nearby offers with user-configurable radius), redemption flow enhancements (1-day QR expiration, merchant staff PIN verification after QR scan), role-based data scoping (application-level: USER=all, MERCHANT=own, ADMIN=all), and user profile management.

## Implementation Decisions

### Merchant Module Structure
- **D-01:** Create dedicated merchant module (`src/modules/merchant/`) — do not extend existing offer module — **Reversibility:** costly — module structure change affects imports and dependency injection

### Branch Management
- **D-02:** Branches require: name, phone, active hours, location coordinates (lat/lng), address — extensible for additional fields later — **Reversibility:** reversible — schema changes are additive

### Staff PIN Management
- **D-03:** Generate unique PIN automatically when staff account is created — **Reversibility:** reversible — business logic change
- **D-04:** When staff leaves company, disable the user account instead of changing PIN — disabled user's PIN won't work — **Reversibility:** reversible — account status flag
- **D-05:** Merchant must enter their password to change staff PIN — prevents compromised merchant account from locking out legitimate staff — **Reversibility:** reversible — security policy

### Location-Based Offers
- **D-06:** Location filtering radius is user-configurable (not fixed) — mobile app sends radius parameter to backend — **Reversibility:** reversible — API parameter change

### Geo-Location Proximity Check
- **D-07:** Do not block redemption entirely if geo-check fails — allow merchant staff to manually override — handles GPS inaccuracies and disabled location — **Reversibility:** reversible — business logic change

### Daily Velocity Cap
- **D-08:** No daily redemption limit per merchant for now — client requirement for free first year — **Reversibility:** reversible — business rule

### Fraud Flags
- **D-09:** Defer fraud flag creation to later phases — app is free for first year, fraud detection not priority — **Reversibility:** reversible — feature deferral

### Data Scoping Implementation
- **D-10:** Implement role-based data scoping at application level (service layer checks) — not database-level — simpler implementation for now — **Reversibility:** costly — moving to database-level later requires query refactoring across all services

### Redemption Code/QR Flow
- **D-11:** Change redemption code/QR TTL from 180 seconds to 1 day — gives users time to travel to merchant location — **Reversibility:** reversible — constant change
- **D-12:** QR expires after 1 day if unused — **Reversibility:** reversible — TTL change
- **D-13:** QR expires immediately after merchant scans it — cannot be regenerated — uniqueness maintained via RedemptionSession status — **Reversibility:** reversible — business logic change
- **D-14:** Merchant staff enters PIN after scanning QR to approve redemption — not before — **Reversibility:** reversible — UX flow change

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

### Project Documents
- `.planning/PROJECT.md` — Project overview, core value, business context, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements with traceability to phases
- `.planning/ROADMAP.md` — Phase breakdown and deliverables

### Existing Code Patterns
- `src/modules/auth/` — Authentication patterns, guards, strategies, decorators (reference for merchant module structure)
- `src/modules/offer/` — Existing CRUD patterns, DTOs, service layer (reference for merchant CRUD)
- `src/modules/redemption/` — Current redemption flow, code generation, distributed locking (to be modified for 1-day TTL)
- `src/common/decorators/` — Custom decorator patterns (for @CurrentUser, @MerchantScope)
- `src/common/guards/` — Guard patterns (for role-based access control)

### Database Schema
- `prisma/schema.prisma` — User, Merchant, MerchantBranch, MerchantStaff, Offer, RedemptionSession models

## Existing Code Insights

### Reusable Assets
- `JwtAuthGuard`, `RolesGuard` — Authentication and authorization guards for merchant/admin endpoints
- `@CurrentUser()` decorator (exists but not used) — For type-safe user injection (replace `(req as any).user`)
- `PrismaService` — Database access singleton
- `RedisModule` / `DistributedLockService` — For distributed locking in redemption flow
- `UploadService` — For merchant logo/branch image uploads
- `AllExceptionsFilter` — Global error handling with RFC 7807 format

### Established Patterns
- Module structure: controller → service → DTOs → types (follow NestJS conventions)
- Role-based access control: `@Roles(UserRole.ADMIN)` decorator with `RolesGuard`
- DTO validation: class-validator decorators with ValidationPipe
- Error handling: AppErrorCode enum for standardized error codes
- Repository pattern: PrismaService injected into services

### Integration Points
- Auth module: Merchant staff authentication via existing JWT flow
- Offer module: Merchant-scoped offer queries (to be enhanced with @MerchantScope)
- Redemption module: QR generation and validation (TTL change from 180s to 1 day)
- Category module: Offer categorization (no changes needed)
- Upload module: Merchant logo and branch image uploads

## Specific Ideas

- QR code display on mobile app instead of text code — backend generates same unique code, app displays as QR
- Merchant verification app scans QR to extract code, then enters PIN to approve
- User-configurable location radius — mobile app sends `radius` parameter in query string
- Application-level data scoping — service layer adds `where: { merchantId }` for merchant users

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 1-Merchant Module & Location Features*
*Context gathered: Oct 5, 2026*
