/**
 * The app's role model in one place.
 *
 * Roles are hierarchical: SUPERADMIN ⊇ ADMIN ⊇ DRIVER. A super admin holds
 * every admin capability plus owner-only platform capabilities. Inheritance
 * is made explicit here (a super admin's role list always contains ADMIN and
 * DRIVER) so a check written as `roles.includes("ADMIN")` can never lock the
 * owner out of an admin feature.
 *
 * Mirrors the server's rolesArrayFor() in
 * supabase/functions/_shared/profileAuthz.ts; src/test/role-model.test.ts
 * keeps the two in step.
 *
 * CLIENT (customer portal) sits outside the staff hierarchy and never
 * inherits or grants anything internal.
 */

export type AppRole = "DRIVER" | "ADMIN" | "SUPERADMIN" | "CLIENT";

/** user_profiles.role → the expanded roles the app works with. */
export function rolesForProfileRole(dbRole: string | null | undefined): AppRole[] {
  switch (dbRole) {
    case "super_admin":
      return ["SUPERADMIN", "ADMIN", "DRIVER"];
    case "admin":
      return ["ADMIN", "DRIVER"];
    case "client":
      return ["CLIENT"];
    default:
      return ["DRIVER"];
  }
}

/** True when a user holding `held` roles satisfies `required` (with inheritance). */
export function roleSatisfies(held: readonly AppRole[], required: AppRole): boolean {
  if (held.includes("CLIENT")) return required === "CLIENT";
  if (held.includes("SUPERADMIN")) return required !== "CLIENT";
  if (held.includes("ADMIN")) return required === "ADMIN" || required === "DRIVER";
  return held.includes(required);
}

/**
 * Capabilities by tier. ADMIN operations are org-scoped for admins and
 * available to the super admin across orgs; OWNER operations are exclusive to
 * the super admin. Server-side enforcement lives in RLS (is_admin_or_super_admin
 * / is_super_admin) and the edge functions; this map documents and tests the
 * contract the UI relies on.
 */
export const ADMIN_CAPABILITIES = [
  "jobs.view_all_org",
  "jobs.create",
  "jobs.edit",
  "jobs.assign",
  "pod.review",
  "pod.email_any_recipient",
  "drivers.view",
  "drivers.edit_profile",
  "drivers.archive_restore",
  "drivers.onboarding",
  "users.create",
  "users.edit",
  "users.activate_suspend",
  "users.set_role_up_to_admin",
  "users.permission_overrides_non_sensitive",
  "clients.manage",
  "clients.portal_access",
  "finance.invoices",
  "finance.expenses",
  "reports.export",
  "control.command_center",
] as const;

export const OWNER_CAPABILITIES = [
  "platform.organisations",
  "platform.all_org_scope",
  "platform.audit_log",
  "platform.error_log",
  "platform.app_settings",
  "users.set_role_super_admin",
  "users.manage_protected",
  "users.permission_overrides_sensitive",
  "users.sync_profiles",
] as const;

export type Capability = (typeof ADMIN_CAPABILITIES)[number] | (typeof OWNER_CAPABILITIES)[number];

export function capabilitiesFor(roles: readonly AppRole[]): Set<Capability> {
  const caps = new Set<Capability>();
  if (roleSatisfies(roles, "ADMIN")) ADMIN_CAPABILITIES.forEach((c) => caps.add(c));
  if (roleSatisfies(roles, "SUPERADMIN")) OWNER_CAPABILITIES.forEach((c) => caps.add(c));
  return caps;
}
