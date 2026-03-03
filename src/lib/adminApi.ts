import { supabase } from "@/integrations/supabase/client";

export async function promoteToAdmin(email: string, orgId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("promote-admin", {
    body: { email, org_id: orgId },
  });

  if (error) {
    throw new Error(error.message ?? "Failed to promote user");
  }

  if (data?.error) {
    throw new Error(data.error);
  }
}
