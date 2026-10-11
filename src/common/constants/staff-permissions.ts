/**
 * Staff granular permissions.
 *
 * These capabilities are stored on `MerchantStaff.permissions` (String[]) and
 * enforced by `@RequireStaffPermission()` + `StaffPermissionGuard`. They are
 * deliberately kept separate from the coarse `UserRole` so a cashier can be
 * granted `redeem` (scan/confirm vouchers) without full merchant-admin rights.
 */
export const STAFF_PERMISSIONS = [
  'redeem',
  'manage_offers',
  'view_reports',
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

/**
 * Runtime guard for values coming from the database / request bodies so an
 * unknown string never silently satisfies a permission check.
 */
export function isStaffPermission(value: string): value is StaffPermission {
  return (STAFF_PERMISSIONS as readonly string[]).includes(value);
}
