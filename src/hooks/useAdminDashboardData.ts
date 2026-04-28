/**
 * Admin Dashboard – supplemental data hooks.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getComplianceCounts } from "@/lib/onboardingApi";
import { listAcknowledgedEvidenceJobIds } from "@/lib/evidenceAckApi";

/**
 * Count of completed jobs (last 7 days) missing evidence,
 * excluding any whose missing-evidence blocker an admin has dismissed.
 */
export function useAdminMissingEvidence() {
  return useQuery({
    queryKey: ["admin-missing-evidence-count"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

      const { data, error } = await supabase
        .from("jobs")
        .select("id")
        .eq("is_hidden", false)
        .in("status", ["completed", "delivery_complete", "pod_ready"])
        .gte("updated_at", weekAgo)
        .or("has_pickup_inspection.eq.false,has_delivery_inspection.eq.false");

      if (error) throw error;
      const ids = (data ?? []).map((r) => r.id as string);
      let dismissed: Set<string> = new Set();
      try {
        dismissed = await listAcknowledgedEvidenceJobIds();
      } catch {
        /* non-fatal */
      }
      return ids.filter((id) => !dismissed.has(id)).length;
    },
    staleTime: 30_000,
  });
}

/**
 * Onboarding/compliance counts for admin intervention.
 */
export function useAdminComplianceCounts() {
  return useQuery({
    queryKey: ["admin-compliance-counts"],
    queryFn: () => getComplianceCounts(),
    staleTime: 60_000,
  });
}
