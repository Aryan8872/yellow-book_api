# OfferNepal

## What This Is

OfferNepal is a subscription-based buy-one-get-one (BOGO) redemption platform for the Nepal market (Pokhara, Chitwan, Kathmandu). Consumers discover and redeem deals across dining, wellness, entertainment, and retail through a Flutter mobile app, while merchants manage offers and verify redemptions through a separate admin panel.

## Core Value

Consumers save money on everyday activities through BOGO deals, while merchants acquire customers without upfront advertising costs by converting spare capacity into revenue.

## Business Context

- **Customer**: Consumers in Nepal (Pokhara, Chitwan, Kathmandu) + Partner merchants
- **Revenue model**: Subscription-based (free for first year, then paid subscriptions)
- **Success metric**: Active subscriptions and redemption volume
- **Strategy notes**: Focus on Nepal market initially, expand to other districts later

## Requirements

### Validated

- [✓] Authentication system (email/password, JWT tokens) — existing codebase
- [✓] Offer CRUD APIs — existing codebase
- [✓] Category management — existing codebase
- [✓] Basic redemption engine with dual-key flow — existing codebase
- [✓] Database schema (User, Merchant, Offer, RedemptionSession) — existing codebase

### Active

- [ ] Merchant module with CRUD, branch management, PIN management, staff management
- [ ] Location-based offer filtering (GPS → nearby offers)
- [ ] Role-based data scoping (USER=all, MERCHANT=own, ADMIN=all)
- [ ] User profile management
- [ ] Enhanced offer search/filter with map integration
- [ ] Merchant verification app APIs
- [ ] Geo-location proximity check for redemption (500m threshold)
- [ ] Daily per-merchant velocity cap for redemptions

### Out of Scope

- Payment gateway integration (deferred to later phases)
- Google Maps API (using OpenStreetMap/MapLibre instead due to cost)
- Subscription billing system (free for first year)
- Real-time notifications (deferred)
- Analytics dashboard for merchants (deferred)

## Context

**Technical Environment:**
- Backend: NestJS, Prisma ORM, Redis (caching/distributed locks), PostgreSQL
- Mobile: Flutter consumer app + separate merchant verification app
- Map provider: OpenStreetMap/MapLibre (not Google Maps due to API cost)
- Existing modules: Auth, Offer, Category, Redemption (partially implemented)

**Current Codebase State:**
- Redemption engine has dual-key flow with Redis distributed locking
- Merchant PIN verification implemented
- Basic offer search/filter exists
- Auth system with JWT tokens working
- No dedicated merchant module (merchant CRUD scattered in offer module)
- No admin module
- No location-based filtering
- No role-based data scoping

**Known Issues:**
- Type safety: Using `(req as any).user` in 6+ locations (should use `@CurrentUser()` decorator)
- Security: Error messages expose internal details (e.g., "Offer with ID ${offerId} not found")
- Code duplication: Merchant ownership check repeated 3 times in offer controller
- Almost no unit tests exist

## Constraints

- **Timeline**: Finish by this week (urgent)
- **Tech stack**: NestJS, Prisma, Redis, PostgreSQL, Flutter (mobile)
- **Map provider**: OpenStreetMap/MapLibre (no Google Maps API due to cost)
- **Market**: Nepal only (Pokhara, Chitwan, Kathmandu districts)
- **Payment**: Not integrating now (deferred to later phases)
- **Subscription**: Free for first year, then paid

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use OpenStreetMap/MapLibre instead of Google Maps | Google Maps API requires billing and has costs; OSM is free and sufficient for Nepal | ✓ Good |
| Free for first year, then subscription | Build user base first, monetize later after proving value | — Pending |
| Separate merchant verification app | Different UX needs for staff vs consumers; security separation | — Pending |
| Priority: merchant module over code quality fixes | Features needed for mobile app integration are blocking | — Pending |

---
*Last updated: Oct 5, 2026 after project initialization*
