// Pure, dependency-free authorization derivation.
//
// SECURITY: a caller's role/org are derived SOLELY from their public.user_profiles
// row (server-controlled). This function deliberately takes ONLY the profile as
// input — there is no parameter for JWT `user_metadata`, so a self-set
// `user_metadata.role`/`org_id` cannot influence the result by construction.
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/edge-authz.test.ts) and reused by _shared/auth.ts.

export type AppRole = "driver" | "admin" | "super_admin";

export interface ProfileRow {
  role?: string | null;
  org_id?: string | null;
  account_status?: string | null;
  email?: string | null;
}

export interface CallerAuthz {
  role: AppRole;
  orgId: string | null;
  accountStatus: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function callerAuthzFromProfile(
  profile: ProfileRow | null | undefined,
): CallerAuthz {
  const role: AppRole =
    profile?.role === "super_admin" || profile?.role === "admin"
      ? profile.role
      : "driver";

  return {
    role,
    orgId: profile?.org_id ?? null,
    accountStatus: profile?.account_status ?? "active",
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
  };
}

/** Roles array for app_metadata, kept in sync with a profile role. */
export function rolesArrayFor(role: AppRole): string[] {
  if (role === "super_admin") return ["SUPERADMIN", "ADMIN", "DRIVER"];
  if (role === "admin") return ["ADMIN", "DRIVER"];
  return ["DRIVER"];
}

/**
 * Error code for a caller whose account may not act, or null when active.
 * Only "active" accounts may use staff/admin functions: pending (invited, not
 * yet activated) and suspended accounts are refused, matching the app's
 * route guards. A missing profile reads as driver/active above, and driver
 * callers are refused by each function's own role check.
 */
export function inactiveAccountError(accountStatus: string): "ACCOUNT_SUSPENDED" | "ACCOUNT_NOT_ACTIVE" | null {
  if (accountStatus === "active") return null;
  return accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_NOT_ACTIVE";
}
