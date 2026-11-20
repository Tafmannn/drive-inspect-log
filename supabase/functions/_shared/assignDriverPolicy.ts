// Pure decision for the assign-driver edge function. Kept free of Deno and
// Supabase imports so vitest can cover every privilege combination
// (src/test/assign-driver-policy.test.ts).
//
// assign-driver runs with the service role, which bypasses the
// guard_user_profile_privileged_columns trigger, so this check is the only
// thing stopping it from rewriting a privileged account. The endpoint may
// only attach a user who is (or will become) a plain driver. It never
// changes anyone's role: promotions and demotions go through user-lifecycle
// (set_role), which audits them.

export interface AssignDriverCaller {
  orgId: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface AssignDriverTarget {
  role?: string | null;
  org_id?: string | null;
  is_protected?: boolean | null;
  client_id?: string | null;
}

export type AssignDriverDecision =
  | { ok: true; targetOrgId: string; changesOrg: boolean }
  | { ok: false; status: number; error: string };

export function decideAssignDriver(
  caller: AssignDriverCaller,
  requestedOrgId: string | null | undefined,
  target: AssignDriverTarget | null,
): AssignDriverDecision {
  if (!caller.isAdmin) return { ok: false, status: 403, error: "ADMIN_OR_SUPER_ADMIN_ONLY" };

  // Admins only ever assign into their own org; super-admins may pick one.
  const targetOrgId = caller.isSuperAdmin ? (requestedOrgId || caller.orgId) : caller.orgId;
  if (!targetOrgId) return { ok: false, status: 400, error: "NO_TARGET_ORG" };

  if (target) {
    // Protected identities (the platform owner) are never touched here,
    // whoever is calling.
    if (target.is_protected) return { ok: false, status: 403, error: "TARGET_PROTECTED" };
    // Portal users are managed only by portal-access.
    if (target.role === "client" || target.client_id) {
      return { ok: false, status: 409, error: "TARGET_IS_PORTAL_USER" };
    }
    // Anything other than an existing driver would be a role change.
    if (target.role && target.role !== "driver") {
      return { ok: false, status: 409, error: "TARGET_ROLE_NOT_DRIVER" };
    }
    // Moving a driver between organisations is a super-admin decision.
    if (target.org_id && target.org_id !== targetOrgId && !caller.isSuperAdmin) {
      return { ok: false, status: 403, error: "CROSS_ORG_FORBIDDEN" };
    }
  }

  return { ok: true, targetOrgId, changesOrg: (target?.org_id ?? null) !== targetOrgId };
}
