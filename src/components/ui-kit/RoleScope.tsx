import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

interface RoleScopeProps {
  /** Allow admin or super_admin. */
  admin?: boolean;
  /** Allow only super_admin. */
  superAdminOnly?: boolean;
  /** Optional explicit override (e.g. for tests or route-level checks). */
  allow?: boolean;
  /** Rendered when the role check passes. */
  children: ReactNode;
  /** Rendered when the role check fails. Defaults to null. */
  fallback?: ReactNode;
}

/**
 * RoleScope — declarative role gate for UI sections.
 *
 * Replaces the repeated `{(isAdmin || isSuperAdmin) && (...)}` pattern with
 * a single source of truth. Defense-in-depth only — the real authorization
 * is enforced by Supabase RLS. Never put the only auth check here.
 *
 * Examples:
 *   <RoleScope admin><AdminPanel /></RoleScope>
 *   <RoleScope superAdminOnly><DangerZone /></RoleScope>
 *   <RoleScope allow={canEdit}><EditButton /></RoleScope>
 */
export function RoleScope({
  admin,
  superAdminOnly,
  allow,
  children,
  fallback = null,
}: RoleScopeProps) {
  const { isAdmin, isSuperAdmin } = useAuth();

  let permitted = false;
  if (typeof allow === "boolean") permitted = allow;
  else if (superAdminOnly) permitted = !!isSuperAdmin;
  else if (admin) permitted = !!isAdmin || !!isSuperAdmin;

  return <>{permitted ? children : fallback}</>;
}
