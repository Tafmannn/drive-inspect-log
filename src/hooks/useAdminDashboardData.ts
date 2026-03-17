/**
 * Admin Dashboard – supplemental data hooks.
 * Separated from useAdminJobQueues for single-responsibility.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Count of completed jobs (last 7 days) missing evidence:
 * - no delivery inspection
 * - OR no pickup inspection
 */
export function useAdminMissingEvidence() {
  return useQuery({
    queryKey: ["admin-missing-evidence-count"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

      const { count, error } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .in("status", ["completed", "delivery_complete", "pod_ready"])
        .gte("updated_at", weekAgo)
        .or("has_pickup_inspection.eq.false,has_delivery_inspection.eq.false");

      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}
