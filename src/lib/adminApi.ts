import { supabase } from "@/integrations/supabase/client";

interface OrgUser {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
}

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
