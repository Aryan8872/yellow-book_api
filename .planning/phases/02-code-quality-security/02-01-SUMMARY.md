# Plan 02-01 Summary

**Plan:** 02-01 - Replace (req as any).user with @CurrentUser() decorator
**Status:** Complete
**Completed:** 2026-10-05

## Tasks Completed

### Task 1: Create or Verify @CurrentUser Decorator
- Verified decorator already exists at `src/common/decorators/current-user.decorator.ts`
- Decorator is properly typed with `AuthenticatedUser`
- Decorator supports both full user object and property extraction

### Task 2: Replace (req as any).user in Merchant Controller
- Removed `getUser()` helper method
- Replaced all `@Req() req: Request` with `@CurrentUser() user: AuthenticatedUser`
- Removed `@Req()` and `Request` import
- Updated all 11 controller methods to use decorator

### Task 3: Replace (req as any).user in Offer Controller
- Replaced `(req as any).user` with `@CurrentUser()` decorator
- Updated createOffer, updateOffer, deleteOffer methods
- Added `CurrentUser` import
- Removed `@Req()` and `Request` import
- Ownership checks remain in controller (service doesn't need user parameter)

### Task 4: Verify Auth Controller Uses @CurrentUser
- Auth controller already uses `@CurrentUser` from common decorators
- Login method kept `@Req()` due to Passport LocalStrategy compatibility (req.user is set by strategy)
- All other auth endpoints use `@CurrentUser`

## Verification

- Build passed successfully (`npm run build`)
- No TypeScript errors
- @CurrentUser decorator used consistently across controllers

## Files Modified

- `src/modules/merchant/merchant.controller.ts` (modified)
- `src/modules/offer/offer.controller.ts` (modified)
- `src/modules/auth/auth.controller.ts` (verified, login kept @Req for Passport compatibility)

## Notes

- Login endpoint kept `@Req()` because Passport LocalStrategy sets `req.user` after authentication
- Offer controller ownership checks remain in controller layer (not moved to service)
- All type assertions removed from merchant and offer controllers

## Success Criteria Met

- [x] @CurrentUser decorator exists and is properly typed
- [x] All (req as any).user usages replaced with @CurrentUser() (except login for Passport compatibility)
- [x] getUser() helper method removed from merchant controller
- [x] TypeScript compilation passes
- [x] No type assertions remain in controllers
