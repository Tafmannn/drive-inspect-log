// Pure, dependency-free rule: may this profile spend the org's paid
// third-party API quota (Google Maps/Places, DVLA)?
//
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/staff-gate.test.ts) and reused by _shared/staffAuth.ts.
//
// Only active staff qualify. Customer-portal logins (role 'client'), users
// without a profile, suspended or not-yet-activated accounts, and staff not
// attached to an org (super admins excepted) are all refused. Fails closed:
// anything unrecognised is refused.

export const STAFF_ROLES = ["driver", "admin", "super_admin"] as const;

export interface StaffProfileRow {
  role?: string | null;
  org_id?: string | null;
  account_status?: string | null;
}

export interface StaffDenial {
  status: 401 | 403 | 500;
  error: "UNAUTHENTICATED" | "STAFF_ONLY" | "PROFILE_LOOKUP_FAILED";
}

export const DENY_UNAUTHENTICATED: StaffDenial = { status: 401, error: "UNAUTHENTICATED" };
export const DENY_NOT_STAFF: StaffDenial = { status: 403, error: "STAFF_ONLY" };
export const DENY_LOOKUP_FAILED: StaffDenial = { status: 500, error: "PROFILE_LOOKUP_FAILED" };

/** Returns null when the profile may proceed, else the denial to send. */
export function staffDecision(profile: StaffProfileRow | null | undefined): StaffDenial | null {
  if (!profile) return DENY_NOT_STAFF;
  const role = profile.role ?? "";
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return DENY_NOT_STAFF;
  if ((profile.account_status ?? "active") !== "active") return DENY_NOT_STAFF;
  if (role !== "super_admin" && !profile.org_id) return DENY_NOT_STAFF;
  return null;
}
