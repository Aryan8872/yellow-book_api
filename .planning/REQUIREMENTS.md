# Requirements: OfferNepal

**Defined:** Oct 5, 2026
**Core Value:** Consumers save money on everyday activities through BOGO deals, while merchants acquire customers without upfront advertising costs by converting spare capacity into revenue.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [✓] **AUTH-01**: User can sign up with email and password — existing codebase
- [✓] **AUTH-02**: User receives JWT tokens for authentication — existing codebase
- [✓] **AUTH-03**: User session persists with refresh token rotation — existing codebase
- [ ] **AUTH-04**: User can update profile information

### Merchant Management

- [ ] **MERC-01**: Merchant can register account
- [ ] **MERC-02**: Merchant can manage business information (name, description, contact)
- [ ] **MERC-03**: Merchant can add/manage multiple branch locations
- [ ] **MERC-04**: Merchant can set and update verification PIN
- [ ] **MERC-05**: Merchant can add/manage staff accounts
- [ ] **MERC-06**: Merchant can view their own offers and redemptions

### Offer Management

- [✓] **OFFR-01**: Merchant can create offers — existing codebase
- [✓] **OFFR-02**: Merchant can update offers — existing codebase
- [✓] **OFFR-03**: Merchant can delete offers — existing codebase
- [✓] **OFFR-04**: Consumer can browse offers — existing codebase
- [ ] **OFFR-05**: Consumer can filter offers by location (GPS-based)
- [ ] **OFFR-06**: Consumer can search offers with advanced filters
- [ ] **OFFR-07**: Offers display on map with branch locations

### Redemption

- [✓] **REDM-01**: Consumer can initiate redemption (generate 180s code) — existing codebase
- [✓] **REDM-02**: Merchant staff can verify redemption with PIN — existing codebase
- [✓] **REDM-03**: System prevents double-spend with distributed locks — existing codebase
- [ ] **REDM-04**: System checks geo-location proximity (500m threshold)
- [ ] **REDM-05**: System enforces daily per-merchant velocity cap
- [ ] **REDM-06**: System creates fraud flags for suspicious activity

### Data Scoping

- [ ] **SCOPE-01**: Consumers see all public data (no scoping)
- [ ] **SCOPE-02**: Merchants see only their own data (offers, branches, redemptions)
- [ ] **SCOPE-03**: Admins see all data (for oversight)

### Categories

- [✓] **CATG-01**: Admin can create categories — existing codebase
- [✓] **CATG-02**: Admin can update categories — existing codebase
- [✓] **CATG-03**: Admin can delete categories — existing codebase
- [✓] **CATG-04**: Consumer can browse categories — existing codebase

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Payments

- **PAYM-01**: User can purchase subscription with payment gateway
- **PAYM-02**: System handles subscription renewals
- **PAYM-03**: System handles subscription cancellations
- **PAYM-04**: Merchant can view payout reports

### Admin Features

- **ADMN-01**: Admin can approve/reject merchant applications
- **ADMN-02**: Admin can manage all users
- **ADMN-03**: Admin can review fraud flags

### Analytics

- **ANLY-01**: Admin can view redemption trends (day by day, week data)
- **ANLY-02**: Admin can view most redeemed offers
- **ANLY-03**: Admin can view trending merchants
- **ANLY-04**: Admin can view merchant revenue analytics
- **ANLY-05**: Admin can view redemption summary by category
- **ANLY-06**: Admin can configure time ranges for analytics

### Notifications

- **NOTF-01**: User receives push notification on redemption
- **NOTF-02**: Merchant receives notification on new redemption
- **NOTF-03**: User can configure notification preferences

## Out of Scope

| Feature | Reason |
|---------|--------|
| Google Maps API | Cost prohibitive; using OpenStreetMap/MapLibre instead |
| Payment gateway integration | Free for first year; defer to v2 |
| Subscription billing system | Free for first year; defer to v2 |
| Real-time notifications | Defer to v2 |
| Analytics dashboard for merchants | Defer to v2 |
| Social features (sharing, reviews) | Not core to MVP |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 0 | Complete |
| AUTH-02 | Phase 0 | Complete |
| AUTH-03 | Phase 0 | Complete |
| AUTH-04 | Phase 1 | Pending |
| MERC-01 | Phase 1 | Pending |
| MERC-02 | Phase 1 | Pending |
| MERC-03 | Phase 1 | Pending |
| MERC-04 | Phase 1 | Pending |
| MERC-05 | Phase 1 | Pending |
| MERC-06 | Phase 1 | Pending |
| OFFR-01 | Phase 0 | Complete |
| OFFR-02 | Phase 0 | Complete |
| OFFR-03 | Phase 0 | Complete |
| OFFR-04 | Phase 0 | Complete |
| OFFR-05 | Phase 1 | Pending |
| OFFR-06 | Phase 1 | Pending |
| OFFR-07 | Phase 1 | Pending |
| REDM-01 | Phase 0 | Complete |
| REDM-02 | Phase 0 | Complete |
| REDM-03 | Phase 0 | Complete |
| REDM-04 | Phase 1 | Pending |
| REDM-05 | Phase 1 | Pending |
| REDM-06 | Phase 1 | Pending |
| SCOPE-01 | Phase 1 | Pending |
| SCOPE-02 | Phase 1 | Pending |
| SCOPE-03 | Phase 1 | Pending |
| CATG-01 | Phase 0 | Complete |
| CATG-02 | Phase 0 | Complete |
| CATG-03 | Phase 0 | Complete |
| CATG-04 | Phase 0 | Complete |
| ADMN-01 | Phase 3 | Pending |
| ADMN-02 | Phase 3 | Pending |
| ADMN-03 | Phase 3 | Pending |
| ANLY-01 | Phase 4 | Pending |
| ANLY-02 | Phase 4 | Pending |
| ANLY-03 | Phase 4 | Pending |
| ANLY-04 | Phase 4 | Pending |
| ANLY-05 | Phase 4 | Pending |
| ANLY-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓
- v2 requirements mapped: 9 total

---
*Requirements defined: Oct 5, 2026*
*Last updated: Oct 5, 2026 after initial definition*
