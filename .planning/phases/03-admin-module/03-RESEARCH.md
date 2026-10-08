# Phase 3: Admin Module - Research

**Created:** 2026-10-05
**Phase:** 3 - Admin Module

---

## Standard Stack

### NestJS Admin Patterns
- **Controller-based approach**: Separate admin controllers from merchant/user controllers
- **Guard-based access**: Admin-only guards using `@Roles(UserRole.ADMIN)`
- **Service layer**: Dedicated admin service or extend existing services with admin methods
- **DTOs**: Admin-specific DTOs for approval/rejection actions

### Prisma for Admin Operations
- **Status updates**: Use `update()` to change merchant status (PENDING_REVIEW → APPROVED/REJECTED)
- **Soft deletes**: Mark users as inactive instead of hard delete
- **Aggregation queries**: Use `groupBy` and `count` for dashboard statistics
- **Transaction support**: Use `$transaction` for multi-step approval workflows

### Admin UI Considerations
- **Pagination**: Admin lists need pagination (large datasets)
- **Filtering**: Admin interfaces need advanced filtering (by status, date, etc.)
- **Bulk actions**: Support bulk approval/rejection of merchants
- **Audit logging**: Track admin actions for compliance

---

## Architecture Patterns

### Admin Module Structure
```
src/modules/admin/
├── admin.controller.ts       # Admin endpoints
├── admin.service.ts          # Admin business logic
├── dto/
│   ├── approve-merchant.dto.ts
│   ├── reject-merchant.dto.ts
│   ├── list-merchants.dto.ts
│   ├── list-users.dto.ts
│   └── review-fraud.dto.ts
└── guards/
    └── admin-only.guard.ts   # Admin-only access
```

### Merchant Approval Workflow
```
Merchant Created (PENDING_REVIEW)
    ↓
Admin Reviews
    ↓
Admin Approves → Merchant Status = APPROVED
    OR
Admin Rejects → Merchant Status = REJECTED
```

### Fraud Review Workflow
```
Fraud Flag Created (PENDING_REVIEW)
    ↓
Admin Reviews
    ↓
Admin Confirms → User Status = SUSPENDED
    OR
Admin Dismisses → Fraud Flag Status = DISMISSED
```

---

## Testing Patterns

### Admin Service Tests
- Mock PrismaService for database operations
- Test approval/rejection logic
- Test pagination and filtering
- Test bulk operations

### Admin Controller Tests
- Mock admin service
- Test authorization (non-admins rejected)
- Test DTO validation
- Test response formatting

---

## Common Pitfalls

### Admin Authorization
- **Pitfall**: Forgetting to add admin guards to endpoints
- **Solution**: Use `@UseGuards(AdminOnlyGuard)` at controller level

### Status Transitions
- **Pitfall**: Allowing invalid status transitions (e.g., APPROVED → PENDING_REVIEW)
- **Solution**: Validate status transitions in service layer)

### Bulk Operations
- **Pitfall**: Not handling partial failures in bulk operations
- **Solution**: Use transactions or implement rollback logic

### Audit Logging
- **Pitfall**: Not tracking who performed admin actions
- **Solution**: Always pass admin user context to service methods

---

## Environment Availability

### Development
- Admin users can be created via database seed
- Test merchants can be created in PENDING_REVIEW state
- Fraud flags can be manually created for testing

### Production
- Admin users should be created via secure process
- Merchant approval should require multiple approvals (optional)
- Fraud review should have escalation paths

---

## State-of-the-Art Updates

### Admin Dashboard Trends
- **Real-time statistics**: Use Redis for caching dashboard metrics
- **WebSocket notifications**: Alert admins of pending approvals
- **AI-assisted fraud detection**: Integrate ML models for fraud scoring

### Admin UX Best Practices
- **Action confirmation**: Require confirmation for destructive actions
- **Undo functionality**: Allow reverting admin actions within time window
- **Comment requirements**: Require comments for rejection actions

---

## Confidence Assessment

### High Confidence
- Basic admin CRUD operations
- Merchant approval workflow
- User management (list, suspend, activate)

### Medium Confidence
- Fraud review interface (depends on fraud flag implementation)
- Payout/settlement management (depends on payment integration)

### Low Confidence
- Bulk operations (need to test performance)
- Audit logging (need to define audit schema)

---

## Dependencies

### Internal Dependencies
- Merchant module (for merchant approval)
- Auth module (for user management)
- Redemption module (for fraud flag review)

### External Dependencies
- Payment gateway (for payout/settlement - Phase 4)
- Email service (for approval notifications - optional)

---

## Success Metrics

### Admin Module Success
- Admin can approve/reject merchants
- Admin can manage users (suspend/activate)
- Admin can review fraud flags
- Admin can view dashboard statistics
- All admin endpoints are properly secured

### Code Quality
- Admin service has unit tests
- Admin controller has integration tests
- Admin guards are tested
- No admin endpoints accessible to non-admins
