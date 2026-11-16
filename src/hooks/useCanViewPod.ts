/**
 * useCanViewPod — honours the "View PODs" (pod.view) permission.
 *
 * Admins / super-admins always can. For everyone else the effective
 * permission (role default + per-user override set in the user's profile)
 * is read from the database. Fails closed: while loading or on error a
 * driver is treated as NOT allowed, so POD links never flash up.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export function useCanViewPod(): boolean {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const privileged = isAdmin || isSuperAdmin;

  const { data } = useQuery({
    queryKey: ["permission", "pod.view", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("user_has_permission", {
        p_user_id: user!.id,
        p_permission_key: "pod.view",
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!user?.id && !privileged,
    staleTime: 60_000,
  });

  if (privileged) return true;
  return data === true;
}
