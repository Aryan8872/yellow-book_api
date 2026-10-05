# Roadmap: OfferNepal

**Created:** Oct 5, 2026
**Core Value:** Consumers save money on everyday activities through BOGO deals, while merchants acquire customers without upfront advertising costs by converting spare capacity into revenue.

---

## Phase 0: Foundation (Complete)

**Status:** Complete
**Goal:** Establish core infrastructure and basic CRUD operations

**Completed:**
- Authentication system (email/password, JWT tokens, refresh rotation)
- Offer CRUD APIs
- Category management
- Basic redemption engine with dual-key flow
- Database schema and Prisma setup
- Redis integration for caching and distributed locks

**Requirements Delivered:**
- AUTH-01, AUTH-02, AUTH-03
- OFFR-01, OFFR-02, OFFR-03, OFFR-04
- REDM-01, REDM-02, REDM-03
- CATG-01, CATG-02, CATG-03, CATG-04

---

## Phase 1: Merchant Module & Location Features

**Status:** Pending
**Goal:** Build merchant management, location-based offers, and data scoping

**Requirements:**
- AUTH-04: User profile management
- MERC-01 through MERC-06: Complete merchant module (CRUD, branches, PIN, staff)
- OFFR-05 through OFFR-07: Location-based offer filtering and map integration
- REDM-04 through REDM-06: Redemption enhancements (geo-check, velocity cap, fraud flags)
- SCOPE-01 through SCOPE-03: Role-based data scoping

**Key Deliverables:**
- Merchant module with full CRUD
- Branch management (merchants add their own locations)
- Merchant PIN management
- Merchant staff management
- GPS-based offer filtering
- Map integration for offer display
- Geo-location proximity check (500m threshold)
- Daily per-merchant velocity cap
- Fraud flag creation
- Role-based data scoping decorator
- User profile management

**Estimated Effort:** 3-4 days

**Plans:** 5 plans
- [ ] 01-01-PLAN.md — Merchant module foundation with CRUD, branch management, and data scoping
- [ ] 01-02-PLAN.md — Staff PIN management with automatic generation and password-protected changes
- [ ] 01-03-PLAN.md — Location-based offer filtering with user-configurable radius
- [ ] 01-04-PLAN.md — Redemption code TTL change from 180s to 1 day
- [ ] 01-05-PLAN.md — User profile management

---

## Phase 2: Code Quality & Security

**Status:** Pending
**Goal:** Fix type safety, security issues, and add tests

**Requirements:** (None - technical debt)

**Key Deliverables:**
- Replace `(req as any).user` with `@CurrentUser()` decorator
- Sanitize error messages to not expose internal details
- Extract merchant ownership check to shared guard
- Add unit tests for redemption module
- Add unit tests for auth module
- Add unit tests for offer module

**Estimated Effort:** 1-2 days

---

## Phase 3: Admin Module

**Status:** Pending
**Goal:** Build admin management features

**Requirements:**
- ADMN-01 through ADMN-04: Admin features

**Key Deliverables:**
- Dedicated admin module
- Merchant approval workflow
- User management for admins
- Fraud review interface
- Payout/settlement management

**Estimated Effort:** 2-3 days

---

## Phase 4: Payments & Subscriptions

**Status:** Pending
**Goal:** Integrate payment gateway and subscription billing

**Requirements:**
- PAYM-01 through PAYM-04: Payment features

**Key Deliverables:**
- Payment gateway integration (eSewa/Khalti/Stripe)
- Subscription purchase flow
- Subscription renewal handling
- Subscription cancellation
- Merchant payout reports

**Estimated Effort:** 3-4 days

---

## Phase 5: Notifications

**Status:** Pending
**Goal:** Add real-time notifications

**Requirements:**
- NOTF-01 through NOTF-03: Notification features

**Key Deliverables:**
- Push notification system
- Redemption notifications
- Merchant notifications
- Notification preferences

**Estimated Effort:** 2-3 days

---

## Future Phases

- Analytics dashboard for merchants
- Social features (sharing, reviews)
- Advanced fraud detection
- Multi-city expansion beyond Pokhara, Chitwan, Kathmandu

---

*Last updated: Oct 5, 2026*
