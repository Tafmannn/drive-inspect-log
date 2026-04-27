/**
 * useDriverPerformance — Stage 7
 *
 * Admin-only. Fetches jobs + inspection signature/timestamp summaries
 * scoped to the org, then computes per-driver performance via the pure
 * `calculateAllDriverPerformance` helper. Returns a map keyed by
 * driver_id (jobs.driver_id, which is the auth user_id).
 *
 * Privacy: this hook ONLY runs when isAdmin. RLS already enforces
 * org_id partitioning at the row level; this is a defence-in-depth
 * client guard.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  calculateAllDriverPerformance,
  type DriverPerfJob,
  type DriverPerformance,
} from "@/lib/driverPerformance";

const LOOKBACK_DAYS = 60;

export function useDriverPerformance(driverIds: string[] | undefined) {
  const { isAdmin } = useAuth();

  return useQuery({
    enabled: isAdmin && !!driverIds && driverIds.length > 0,
    queryKey: [
      "driver-performance",
      (driverIds ?? [])
        .slice()
        .sort((a, b) =>
          String(a ?? "").localeCompare(String(b ?? ""), "en-GB", { sensitivity: "base" }),
        )
        .join(","),
    ],
    queryFn: async (): Promise<Record<string, DriverPerformance>> => {
      const ids = driverIds ?? [];
      if (ids.length === 0) return {};

      const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();

      // Pull jobs assigned to any of the requested drivers in window.
      const jobsRes = await supabase
        .from("jobs")
        .select(
          "id, driver_id, status, total_price, completed_at, created_at, updated_at, pickup_time_to, delivery_time_to",
        )
        .in("driver_id", ids)
        .gte("updated_at", sinceIso)
        .limit(2000);

      if (jobsRes.error) throw jobsRes.error;
      const jobsRows = jobsRes.data ?? [];
      const jobIds = jobsRows.map((j) => j.id);

      // Pull inspection summaries (signatures + timestamps) for those jobs.
      let inspections: Array<{
        job_id: string;
        type: string;
        inspected_at: string | null;
        driver_signature_url: string | null;
        customer_signature_url: string | null;
      }> = [];
      if (jobIds.length > 0) {
        const inspRes = await supabase
          .from("inspections")
          .select("job_id, type, inspected_at, driver_signature_url, customer_signature_url")
          .in("job_id", jobIds)
          .is("archived_at", null);
        if (inspRes.error) throw inspRes.error;
        inspections = inspRes.data ?? [];
      }

      // Index inspections per job.
      const insByJob = new Map<
        string,
        { pickup?: typeof inspections[number]; delivery?: typeof inspections[number] }
      >();
      for (const i of inspections) {
        const slot = insByJob.get(i.job_id) ?? {};
        if (i.type === "pickup") slot.pickup = i;
        if (i.type === "delivery") slot.delivery = i;
        insByJob.set(i.job_id, slot);
      }

      const enriched: DriverPerfJob[] = jobsRows.map((j) => {
        const ins = insByJob.get(j.id);
        const driverSig = ins?.delivery?.driver_signature_url || ins?.pickup?.driver_signature_url || null;
        const custSig = ins?.delivery?.customer_signature_url || ins?.pickup?.customer_signature_url || null;
        return {
          id: j.id,
          driver_id: j.driver_id ?? null,
          status: j.status,
          total_price: j.total_price,
          completed_at: j.completed_at,
          created_at: j.created_at,
          updated_at: j.updated_at,
          pickup_time_to: j.pickup_time_to,
          delivery_time_to: j.delivery_time_to,
          pickup_inspected_at: ins?.pickup?.inspected_at ?? null,
          delivery_inspected_at: ins?.delivery?.inspected_at ?? null,
          has_driver_signature: !!driverSig,
          has_customer_signature: !!custSig,
          // failed_upload_count is driver-local IndexedDB state; left undefined.
        };
      });

      return calculateAllDriverPerformance(ids, enriched);
    },
    staleTime: 60_000,
  });
}
