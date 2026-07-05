import { supabase } from "@/integrations/supabase/client";

export interface OrgUser {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
  is_active?: boolean;
}

export interface OrgRecord {
  id: string;
  name: string;
  created_at: string;
}

// ── Helpers ──

export async function assignDriver(email: string, orgId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("assign-driver", {
    body: { email, org_id: orgId },
  });
  if (error) throw new Error(error.message ?? "Failed to assign driver");
  if (data?.error) throw new Error(data.error);
}

export async function getOrgUsers(targetOrgId?: string): Promise<OrgUser[]> {
  const { data, error } = await supabase.functions.invoke("get-org-users", {
    body: targetOrgId ? { org_id: targetOrgId } : {},
  });
  if (error) throw new Error(error.message ?? "Failed to fetch users");
  if (data?.error) throw new Error(data.error);
  return data?.users ?? [];
}

// ── Super Admin actions (routed through the user-lifecycle edge function) ──
//
// SECURITY: these previously went through `promote-admin`, which authorized off
// the JWT `app_metadata` and wrote role/status ONLY to JWT metadata — NOT to
// `user_profiles`. Because all real authorization (AuthContext + RLS helpers)
// reads from `user_profiles`, those role/create actions were a silent no-op.
// `user-lifecycle` authorizes from `user_profiles` and writes it authoritatively.

async function userLifecycleAction(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("user-lifecycle", { body });
  if (error) throw new Error(error.message ?? "Action failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createOrganisation(name: string): Promise<OrgRecord> {
  const result = await userLifecycleAction({ _action: "create_org", name });
  return result.org;
}

export async function createUser(email: string, role: string, orgId: string): Promise<string> {
  const result = await userLifecycleAction({ _action: "create", email, role, org_id: orgId });
  return result.user_id;
}

export async function setUserRole(userId: string, role: string): Promise<void> {
  await userLifecycleAction({ _action: "set_role", user_id: userId, role });
}

export async function deactivateUser(userId: string): Promise<void> {
  await userLifecycleAction({ _action: "suspend", user_id: userId });
}

export async function reactivateUser(userId: string): Promise<void> {
  await userLifecycleAction({ _action: "reactivate", user_id: userId });
}

export async function listAllUsers(): Promise<OrgUser[]> {
  const result = await userLifecycleAction({ _action: "list" });
  // Adapt user_profiles rows → the OrgUser shape the SuperAdmin UI expects.
  // `account_status` is the authoritative active/suspended signal.
  return (result.users ?? []).map((p: Record<string, any>) => ({
    id: p.auth_user_id,
    email: p.email ?? "",
    role: p.role ?? "driver",
    org_id: p.org_id ?? null,
    is_active: p.account_status !== "suspended",
  }));
}
