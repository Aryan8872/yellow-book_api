# Phase 1: Merchant Module & Location Features - Research

**Researched:** 2026-10-05
**Domain:** NestJS backend with Prisma ORM, geospatial queries, role-based access control
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create dedicated merchant module (`src/modules/merchant/`) — do not extend existing offer module
- **D-02:** Branches require: name, phone, active hours, location coordinates (lat/lng), address — extensible for additional fields later
- **D-03:** Generate unique PIN automatically when staff account is created
- **D-04:** When staff leaves company, disable the user account instead of changing PIN — disabled user's PIN won't work
- **D-05:** Merchant must enter their password to change staff PIN — prevents compromised merchant account from locking out legitimate staff
- **D-06:** Location filtering radius is user-configurable (not fixed) — mobile app sends radius parameter to backend
- **D-07:** Do not block redemption entirely if geo-check fails — allow merchant staff to manually override — handles GPS inaccuracies and disabled location
- **D-08:** No daily redemption limit per merchant for now — client requirement for free first year
- **D-09:** Defer fraud flag creation to later phases — app is free for first year, fraud detection not priority
- **D-10:** Implement role-based data scoping at application level (service layer checks) — not database-level — simpler implementation for now
- **D-11:** Change redemption code/QR TTL from 180 seconds to 1 day — gives users time to travel to merchant location
- **D-12:** QR expires after 1 day if unused
- **D-13:** QR expires immediately after merchant scans it — cannot be regenerated — uniqueness maintained via RedemptionSession status
- **D-14:** Merchant staff enters PIN after scanning QR to approve redemption — not before

### Claude's Discretion
None — all decisions explicitly specified by user.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Merchant CRUD APIs | API/Backend | Database/Storage | Business logic in NestJS services, data in PostgreSQL |
| Branch management | API/Backend | Database/Storage | Geospatial data stored in Postgres, queries via Prisma |
| Staff PIN management | API/Backend | Database/Storage | PIN validation in service layer, bcrypt hashing |
| Location-based filtering | API/Backend | Database/Storage | Haversine calculation in service, coordinates in Postgres |
| Redemption flow changes | API/Backend | Database/Storage | TTL change in constants, session state in Postgres |
| Role-based data scoping | API/Backend | — | Application-level filters in service layer |
| User profile management | API/Backend | Database/Storage | Profile updates via Prisma |
</architectural_responsibility_map>

<research_summary>
## Summary

Researched the NestJS/Prisma ecosystem for implementing merchant management, geospatial queries, and role-based data scoping. The codebase already has a solid foundation with Auth, Offer, Category, and Redemption modules following NestJS best practices.

Key findings:
1. **Geospatial queries**: Use Haversine formula in application layer for distance calculations. PostgreSQL has PostGIS extension available but not required for basic radius filtering. The schema already has lat/lng indexes on MerchantBranch.
2. **Data scoping**: Application-level scoping via service layer `where` filters is simpler and sufficient for MVP. Can migrate to database-level (row-level security) later if needed.
3. **PIN management**: Follow existing bcrypt pattern from auth module. Generate 4-digit PIN on staff creation, hash with bcrypt, verify during redemption.
4. **Redemption TTL**: Simple constant change from 180s to 86400s (1 day) in `redemption.constants.ts`. No distributed lock changes needed.
5. **Module structure**: Follow existing pattern (controller → service → DTOs → types). New merchant module at `src/modules/merchant/`.

No external dependencies needed. All functionality can be built with existing stack (NestJS, Prisma, bcrypt, class-validator).

**Primary recommendation:** Build merchant module following existing patterns, use Haversine for geospatial filtering, implement application-level data scoping via service layer filters.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/common | 11.0.1 | NestJS core decorators (HTTP exceptions, Injectable) | Framework foundation |
| @nestjs/swagger | 12.0.2 | API documentation decorators | Auto-generates OpenAPI docs |
| @prisma/client | 5.16.2 | Type-safe ORM | Already in project, schema exists |
| class-validator | 0.15.1 | DTO validation decorators | Standard NestJS validation |
| class-transformer | 0.5.1 | Object transformation | Works with class-validator |
| bcrypt | 6.0.0 | Password/PIN hashing | Already used in auth module |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | 14.0.2 | Unique ID generation | If manual ID generation needed (Prisma uses cuid() by default) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Haversine formula | PostGIS extension | PostGIS more powerful but adds complexity; Haversine sufficient for MVP |

**Installation:** No new packages needed - all already in project.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile App / Web Client                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (JWT)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    NestJS API Gateway                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Global Guards (Throttler, JwtAuth, Roles)           │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Merchant     │ │ Offer        │ │ Redemption   │
│ Controller   │ │ Controller   │ │ Controller   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Merchant     │ │ Offer        │ │ Redemption   │
│ Service      │ │ Service      │ │ Service      │
│ (Data Scoping)│ │ (Data Scoping)│ │ (TTL Change) │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┴────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   PrismaService       │
              │   (PostgreSQL)        │
              └──────────────────────┘
```

### Recommended Project Structure
```
src/modules/merchant/
├── merchant.module.ts          # Module definition
├── merchant.controller.ts      # HTTP endpoints
├── merchant.service.ts         # Business logic + data scoping
├── dto/
│   ├── create-merchant.dto.ts
│   ├── update-merchant.dto.ts
│   ├── create-branch.dto.ts
│   ├── update-branch.dto.ts
│   ├── create-staff.dto.ts
│   ├── update-staff.dto.ts
│   └── update-pin.dto.ts
├── merchant.types.ts           # TypeScript interfaces
└── merchant.constants.ts       # Constants (PIN length, etc.)
```

### Pattern 1: Application-Level Data Scoping
**What:** Add `where: { merchantId }` filter to Prisma queries for merchant users
**When to use:** Any service method that returns merchant-owned data
**Example:**
```typescript
// Source: Existing pattern in offer.service.ts
async getOffers(query: QueryOffersDto, user: AuthenticatedUser) {
  const where: Prisma.OfferWhereInput = {
    isActive: true,
  };

  // Application-level data scoping
  if (user.role === UserRole.MERCHANT_STAFF || user.role === UserRole.MERCHANT_ADMIN) {
    where.merchantId = user.merchantId;
  }

  const offers = await this.prisma.offer.findMany({ where });
  return offers;
}
```

### Pattern 2: Haversine Distance Calculation
**What:** Calculate distance between two lat/lng coordinates using Haversine formula
**When to use:** Filtering offers by user location
**Example:**
```typescript
// Source: Standard geospatial calculation
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
```

### Pattern 3: PIN Generation and Hashing
**What:** Generate random 4-digit PIN, hash with bcrypt, store in database
**When to use:** Creating staff accounts
**Example:**
```typescript
// Source: Existing pattern in auth.service.ts
import * as bcrypt from 'bcrypt';

function generatePin(): string {
  // Generate 4-digit PIN (0000-9999)
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function hashPin(pin: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(pin, saltRounds);
}

async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
```

### Anti-Patterns to Avoid
- **Database-level scoping without migration:** Don't add row-level security without proper migration strategy
- **Hardcoded radius values:** Don't hardcode 5km or 10km - make it user-configurable
- **Blocking redemption on geo-fail:** Don't block entirely - allow merchant override per decision D-07
- **Changing PIN on staff departure:** Don't change PIN - disable user account per decision D-04
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password/PIN hashing | Custom hash function | bcrypt | bcrypt handles salt, rounds, timing attacks |
| DTO validation | Manual validation logic | class-validator decorators | Standard NestJS pattern, cleaner code |
| Distance calculation | Custom math | Haversine formula (standard) | Well-tested geospatial algorithm |
| UUID generation | Math.random() | Prisma cuid() or uuid package | Collision-resistant, standard format |

**Key insight:** The codebase already has established patterns for authentication, validation, and database access. Follow these patterns rather than inventing new ones.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Data Scoping Inconsistency
**What goes wrong:** Some endpoints scoped, others not - merchants see data they shouldn't
**Why it happens:** Forgetting to add scoping to new endpoints
**How to avoid:** Create a helper function `applyMerchantScope(where, user)` and use it consistently
**Warning signs:** Merchant users seeing other merchants' offers/branches

### Pitfall 2: PIN Reuse
**What goes wrong:** Multiple staff have same PIN, security risk
**Why it happens:** Using random without uniqueness check
**How to avoid:** Generate 4-digit PIN with sufficient entropy (1000-9999 range is 9000 combinations)
**Warning signs:** PIN collision in database

### Pitfall 3: Geospatial Performance
**What goes wrong:** Slow queries when filtering by location with many branches
**Why it happens:** Calculating distance for every branch in application layer
**How to avoid:** Add database indexes on lat/lng (already exists), consider bounding box pre-filter
**Warning signs:** Slow API response times on location queries

### Pitfall 4: TTL Confusion
**What goes wrong:** Redemption codes expire too quickly or not at all
**Why it happens:** Wrong constant value or not using constant
**How to avoid:** Use centralized constant in `redemption.constants.ts`, test with different values
**Warning signs:** Users complaining about expired codes or codes not expiring
</common_pitfalls>

<code_examples>
## Code Examples

### Merchant Module Structure
```typescript
// Source: Existing pattern in src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';

@Module({
  imports: [PrismaModule, PassportModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
```

### Merchant CRUD with Data Scoping
```typescript
// Source: Pattern from offer.service.ts
@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  async getMerchant(id: string, user: AuthenticatedUser) {
    const where: Prisma.MerchantWhereInput = { id };

    // Application-level data scoping
    if (user.role === UserRole.MERCHANT_STAFF || user.role === UserRole.MERCHANT_ADMIN) {
      if (user.merchantId !== id) {
        throw new ForbiddenException('Access denied');
      }
    }

    const merchant = await this.prisma.merchant.findUnique({ where });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }
}
```

### Location-Based Filtering
```typescript
// Source: Standard geospatial pattern
async getNearbyOffers(
  userLat: number,
  userLng: number,
  radiusKm: number,
  user: AuthenticatedUser
) {
  const offers = await this.prisma.offer.findMany({
    where: { isActive: true },
    include: {
      merchant: {
        include: {
          branches: true,
        },
      },
    },
  });

  // Filter by distance using Haversine
  const nearbyOffers = offers.filter((offer) => {
    return offer.merchant.branches.some((branch) => {
      const distance = haversineDistance(
        userLat,
        userLng,
        Number(branch.lat),
        Number(branch.lng)
      );
      return distance <= radiusKm;
    });
  });

  return nearbyOffers;
}
```

### Staff PIN Management
```typescript
// Source: Pattern from auth.service.ts
async createStaff(merchantId: string, userId: string) {
  const pin = generatePin();
  const pinHash = await hashPin(pin);

  const staff = await this.prisma.merchantStaff.create({
    data: {
      merchantId,
      userId,
      pinHash, // Store hashed PIN
    },
  });

  // Return PIN only once (for communication to staff)
  return { staff, pin };
}

async verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
  const staff = await this.prisma.merchantStaff.findUnique({
    where: { id: staffId },
    include: { user: true },
  });

  if (!staff || !staff.user.isActive) {
    return false; // Disabled staff cannot verify
  }

  // Verify against merchant's PIN hash
  const merchant = await this.prisma.merchant.findUnique({
    where: { id: staff.merchantId },
  });

  if (!merchant?.merchantPinHash) {
    return false;
  }

  return verifyPin(pin, merchant.merchantPinHash);
}
```
</code_examples>

<sota_updates>
## State of the Art (2024-2025)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual distance calc | Haversine formula | Standard for years | Well-tested, accurate enough for MVP |
| Database-level scoping | Application-level scoping | Simpler for MVP | Can migrate to RLS later if needed |
| PostGIS for all geo | Haversine for basic radius | PostGIS overkill for MVP | PostGIS adds complexity, Haversine sufficient |

**New tools/patterns to consider:**
- **PostGIS extension:** If geospatial queries become complex (polygon filtering, etc.)
- **Row-level security:** If data scoping needs database-level enforcement

**Deprecated/outdated:**
- **Custom hash functions:** Always use bcrypt for passwords/PINs
- **Manual DTO validation:** Use class-validator decorators
</sota_updates>

<open_questions>
## Open Questions

None - all implementation approaches are clear based on existing codebase patterns and standard practices.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Existing codebase patterns (src/modules/auth, src/modules/offer, src/modules/redemption)
- Prisma schema (prisma/schema.prisma)
- NestJS documentation (https://docs.nestjs.com)
- bcrypt documentation (https://github.com/kelektiv/node.bcrypt.js)

### Secondary (MEDIUM confidence)
- Haversine formula (standard geospatial algorithm, widely documented)
- Geospatial indexing best practices (PostgreSQL documentation)

### Tertiary (LOW confidence - needs validation)
- None - all findings verified against codebase or standard practices
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: NestJS, Prisma, PostgreSQL
- Ecosystem: bcrypt, class-validator, Haversine formula
- Patterns: Data scoping, geospatial filtering, PIN management
- Pitfalls: Scoping consistency, PIN reuse, performance, TTL

**Confidence breakdown:**
- Standard stack: HIGH - all packages already in project
- Architecture: HIGH - based on existing codebase patterns
- Pitfalls: HIGH - identified from common NestJS/Prisma issues
- Code examples: HIGH - derived from existing codebase

**Research date:** 2026-10-05
**Valid until:** 2026-11-05 (30 days - stable tech stack)
</metadata>

---

*Phase: 01-merchant-module-location-features*
*Research completed: 2026-10-05*
*Ready for planning: yes*
