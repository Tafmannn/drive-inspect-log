import { supabase } from "@/integrations/supabase/client";

interface OrgUser {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
  is_active?: boolean;
}

interface OrgRecord {
  id: string;
  name: string;
  created_at: string;
}

// ── Legacy helpers ──

export async function promoteToAdmin(email: string, orgId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("promote-admin", {
    body: { email, org_id: orgId },
  });
  if (error) throw new Error(error.message ?? "Failed to promote user");
  if (data?.error) throw new Error(data.error);
}

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

// ── Super Admin actions (routed through promote-admin edge function) ──

async function superAdminAction(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("promote-admin", { body });
  if (error) throw new Error(error.message ?? "Action failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createOrganisation(name: string): Promise<OrgRecord> {
  const result = await superAdminAction({ _action: "create_org", name });
  return result.org;
}

export async function createUser(email: string, role: string, orgId: string): Promise<string> {
  const result = await superAdminAction({ _action: "create_user", email, role, org_id: orgId });
  return result.user_id;
}

export async function setUserRole(userId: string, role: string, orgId?: string): Promise<void> {
  await superAdminAction({ _action: "set_role", user_id: userId, role, org_id: orgId });
}

export async function deactivateUser(userId: string): Promise<void> {
  await superAdminAction({ _action: "deactivate", user_id: userId });
}

export async function reactivateUser(userId: string): Promise<void> {
  await superAdminAction({ _action: "reactivate", user_id: userId });
}

export async function listAllUsers(): Promise<OrgUser[]> {
  const result = await superAdminAction({ _action: "list" });
  return result.users ?? [];
}
