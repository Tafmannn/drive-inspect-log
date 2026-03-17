/**
 * POD Review Data Hook — /admin/pod-review
 *
 * Fetches closure-stage jobs (delivery_complete, pod_ready) + recently completed (7d),
 * joins inspections to derive signature status, and groups into 4 review bands:
 *   1. Missing Inspection — no delivery inspection on closure-stage job
 *   2. Missing Signatures — has inspection but missing customer/driver signature
 *   3. POD Ready — pod_ready status with complete evidence
 *   4. Recently Completed — completed within 7 days
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS, PENDING_STATUSES } from "@/lib/statusConfig";

const REVIEW_WINDOW_DAYS = 7;

export interface PodReviewRow {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string;
  status: string;
  driver_id: string | null;
  resolvedDriverName: string | null;
  pickup_city: string;
  pickup_postcode: string;
  delivery_city: string;
  delivery_postcode: string;
  updated_at: string;
  completed_at: string | null;
  has_pickup_inspection: boolean;
  has_delivery_inspection: boolean;
  /** Whether the delivery inspection has a customer signature */
  hasCustomerSignature: boolean;
  /** Whether the delivery inspection has a driver signature */
  hasDriverSignature: boolean;
}

export interface PodReviewGroups {
  missingInspection: PodReviewRow[];
  missingSignatures: PodReviewRow[];
  podReady: PodReviewRow[];
  recentlyCompleted: PodReviewRow[];
}

export interface PodReviewKpis {
  missingInspection: number;
  missingSignatures: number;
  podReady: number;
  recentlyCompleted: number;
}

const JOB_FIELDS = [
  "id", "external_job_number", "vehicle_reg", "status",
  "driver_id", "driver_name", "pickup_city", "pickup_postcode",
  "delivery_city", "delivery_postcode", "updated_at", "completed_at",
  "has_pickup_inspection", "has_delivery_inspection",
  "driver_profiles(display_name, full_name)",
].join(", ");

function resolveDriverName(row: any): string | null {
  const p = row.driver_profiles;
  return p ? (p.display_name || p.full_name || row.driver_name) : (row.driver_name || null);
}

export function usePodReviewData() {
  return useQuery({
    queryKey: ["admin-pod-review"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - REVIEW_WINDOW_DAYS);

      // 1) Closure-stage jobs + recently completed
      const [closureRes, completedRes] = await Promise.all([
        supabase
          .from("jobs")
          .select(JOB_FIELDS)
          .eq("is_hidden", false)
          .in("status", PENDING_STATUSES as string[])
          .order("updated_at", { ascending: true })
          .limit(150),
        supabase
          .from("jobs")
          .select(JOB_FIELDS)
          .eq("is_hidden", false)
          .eq("status", JOB_STATUS.COMPLETED)
          .gte("completed_at", cutoff.toISOString())
          .order("completed_at", { ascending: false })
          .limit(50),
      ]);

      if (closureRes.error) throw closureRes.error;
      if (completedRes.error) throw completedRes.error;

      const allJobIds = [
        ...(closureRes.data ?? []).map((j: any) => j.id),
        ...(completedRes.data ?? []).map((j: any) => j.id),
      ];

      // 2) Fetch delivery inspections for signature status
      let sigMap: Record<string, { customer: boolean; driver: boolean }> = {};
      if (allJobIds.length > 0) {
        const { data: inspections } = await supabase
          .from("inspections")
          .select("job_id, customer_signature_url, driver_signature_url")
          .eq("type", "delivery")
          .in("job_id", allJobIds);

        for (const insp of inspections ?? []) {
          sigMap[insp.job_id] = {
            customer: !!insp.customer_signature_url,
            driver: !!insp.driver_signature_url,
          };
        }
      }

      // 3) Build rows
      function toRow(j: any): PodReviewRow {
        const sigs = sigMap[j.id];
        return {
          id: j.id,
          external_job_number: j.external_job_number,
          vehicle_reg: j.vehicle_reg,
          status: j.status,
          driver_id: j.driver_id,
          resolvedDriverName: resolveDriverName(j),
          pickup_city: j.pickup_city,
          pickup_postcode: j.pickup_postcode,
          delivery_city: j.delivery_city,
          delivery_postcode: j.delivery_postcode,
          updated_at: j.updated_at,
          completed_at: j.completed_at,
          has_pickup_inspection: j.has_pickup_inspection,
          has_delivery_inspection: j.has_delivery_inspection,
          hasCustomerSignature: sigs?.customer ?? false,
          hasDriverSignature: sigs?.driver ?? false,
        };
      }

      const closureRows = (closureRes.data ?? []).map(toRow);
      const completedRows = (completedRes.data ?? []).map(toRow);

      // 4) Group closure rows into bands
      const groups: PodReviewGroups = {
        missingInspection: [],
        missingSignatures: [],
        podReady: [],
        recentlyCompleted: completedRows,
      };

      for (const row of closureRows) {
        if (!row.has_delivery_inspection) {
          groups.missingInspection.push(row);
        } else if (!row.hasCustomerSignature || !row.hasDriverSignature) {
          groups.missingSignatures.push(row);
        } else {
          groups.podReady.push(row);
        }
      }

      const kpis: PodReviewKpis = {
        missingInspection: groups.missingInspection.length,
        missingSignatures: groups.missingSignatures.length,
        podReady: groups.podReady.length,
        recentlyCompleted: groups.recentlyCompleted.length,
      };

      return { groups, kpis };
    },
    staleTime: 20_000,
  });
}
