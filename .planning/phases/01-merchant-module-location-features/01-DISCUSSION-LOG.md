# Phase 1: Merchant Module & Location Features - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 1-Merchant Module & Location Features
**Areas discussed:** Merchant module structure, Branch location data, PIN management security, Location filtering radius, Geo-location check edge cases, Daily velocity cap value, Fraud flag triggers, Data scoping implementation, Redemption code/QR flow

---

## Merchant Module Structure

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated module (`src/modules/merchant/`) | Follows established pattern of Auth/Offer/Category/Redemption, keeps concerns separated | ✓ |
| Extend existing offer module | Merchant CRUD scattered in offer module, less modular | |

**User's choice:** "merchant should have its own modoule"
**Notes:** New dedicated module follows established architectural patterns

---

## Branch Location Data

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: lat/lng only | Basic location coordinates only | |
| Full: name, phone, hours, lat/lng, address, extensible | Comprehensive branch data with room for additional fields | ✓ |

**User's choice:** "for branches data , i think they would need phone , active hours, location coord , name , and other fields which can be added accoriding to requirements"
**Notes:** Schema already has MerchantBranch with lat/lng, address, phone fields

---

## PIN Management Security

| Option | Description | Selected |
|--------|-------------|----------|
| No re-authentication, no cooldown | Simple but less secure | |
| Re-authentication required, no cooldown | Moderate security | |
| Re-authentication required + cooldown period | Highest security | ✓ |

**User's choice:** "yes alos to normally change the pin of the staff the merchant should enter the password"
**Notes:** PIN is for merchant staff verification at POS, not for consumers. When staff leaves, disable user account instead of changing PIN. Generate unique PIN automatically when staff account is created.

---

## Location Filtering Radius

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed radius (e.g., 5km) | Simple but inflexible | |
| User-configurable radius | Mobile app sends radius parameter | ✓ |

**User's choice:** "make it user configurable"
**Notes:** Mobile app sends radius parameter in query string

---

## Geo-Location Check Edge Cases

| Option | Description | Selected |
|--------|-------------|----------|
| Block redemption if geo-check fails | Strict enforcement | |
| Allow merchant staff manual override | Handles GPS inaccuracies and disabled location | ✓ |

**User's choice:** "i dont think we need to block the redemption entirely"
**Notes:** 500m threshold exists but enforcement allows override for GPS inaccuracies and indoor locations

---

## Daily Velocity Cap Value

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed limit (e.g., 50/day) | Prevents abuse but restricts legitimate use | |
| Configurable per merchant | Flexible but adds complexity | |
| No limit for now | Free first year, client requirement | ✓ |

**User's choice:** "for now according to my client they can redeem any amout on any offer or merhcant's branches"
**Notes:** Defer velocity cap to later phases when subscription billing is implemented

---

## Fraud Flag Triggers

| Option | Description | Selected |
|--------|-------------|----------|
| Implement now (geo-mismatch, rapid redemptions, patterns) | Comprehensive fraud detection | |
| Defer to later phases | Free first year, not priority | ✓ |

**User's choice:** "right now i think the fraud flag should be reconsidered to be left for now as this app is meant to be free for 1 year so"
**Notes:** Fraud detection deferred to later phases when monetization begins

---

## Data Scoping Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Database-level (Prisma where filters) | More secure but requires careful query construction | |
| Application-level (service layer checks) | Simpler implementation for now | ✓ |

**User's choice:** "for now do the application level"
**Notes:** Application-level is simpler; can migrate to database-level later if needed

---

## Redemption Code/QR Flow

| Option | Description | Selected |
|--------|-------------|----------|
| 180-second TTL (current) | Too short for travel time | |
| 10-15 minute TTL | Better for travel | |
| 1-day TTL, expires after scan | User-friendly, uniqueness maintained | ✓ |

**User's choice:** "maybe we should do like this , generate the qr and expire after 1 day normally if left without going to merchant and after merchant scans expire it too"
**Notes:** QR displayed on mobile app instead of text code. Merchant staff enters PIN after scanning QR to approve (not before). Scanned QR cannot be regenerated.

---

## Claude's Discretion

None — all decisions explicitly specified by user.

## Deferred Ideas

None — discussion stayed within phase scope.
