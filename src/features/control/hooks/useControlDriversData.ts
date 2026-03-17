/**
 * Data hooks for the Drivers Control Page.
 * Queries driver_profiles + derives workload from jobs.
 *
 * PREFER-READ: Uses jobs.driver_id FK join for workload where available.
 * FALLBACK-READ: Falls back to driver_name matching for legacy rows with null driver_id.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES } from "@/lib/statusConfig";
import { isJobStale } from "@/features/control/pages/jobs/jobsUtils";

/** Statuses that count as "workload" for a driver (active + pending-review). */
const WORKLOAD_STATUSES: string[] = [
  ...(ACTIVE_STATUSES as string[]),
  ...(PENDING_STATUSES as string[]),
  "assigned",
];

interface WorkloadJob {
  driver_id: string | null;
  driver_name: string | null;
  vehicle_reg: string;
  status: string;
  updated_at: string;
}

export interface DriverWorkloadJob {
  vehicle_reg: string;
  status: string;
  updated_at: string;
  isStale: boolean;
}

export interface DriverControlRow {
  id: string;
  user_id: string;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  is_active: boolean;
  licence_expiry: string | null;
  trade_plate_number: string | null;
  employment_type: string | null;
  created_at: string;
  // derived workload
  activeJobCount: number;
  latestJobReg: string | null;
  latestJobStatus: string | null;
  hasStaleJob: boolean;
  /** Whether workload was derived via FK (true) or name fallback (false). null = no workload. */
  workloadLinkType: "fk" | "name" | null;
  // derived risk cues
  missingPhone: boolean;
  missingTradePlate: boolean;
}

export type DriverFilter = "all" | "active" | "inactive" | "with-workload" | "no-workload" | "licence-expiring" | "missing-plate";

export function useControlDrivers(search: string, filter: DriverFilter = "all") {
  return useQuery({
    queryKey: ["control-drivers", search, filter],
    queryFn: async () => {
      // Fetch drivers
      const { data: drivers, error: dErr } = await supabase
        .from("driver_profiles")
        .select("id, user_id, full_name, display_name, phone, is_active, licence_expiry, trade_plate_number, employment_type, created_at")
        .order("full_name", { ascending: true })
        .limit(200);
      if (dErr) throw dErr;

      // Fetch workload jobs — include driver_id + driver_name for hybrid matching
      const { data: jobs, error: jErr } = await supabase
        .from("jobs")
        .select("driver_id, driver_name, vehicle_reg, status, updated_at")
        .eq("is_hidden", false)
        .in("status", WORKLOAD_STATUSES)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (jErr) throw jErr;

      // Build workload maps keyed by driver_profile.id (preferred) with name fallback
      const workloadById = new Map<string, WorkloadJob[]>();
      const workloadByName = new Map<string, WorkloadJob[]>();

      for (const j of (jobs ?? []) as WorkloadJob[]) {
        if (j.driver_id) {
          const arr = workloadById.get(j.driver_id) ?? [];
          arr.push(j);
          workloadById.set(j.driver_id, arr);
        } else if (j.driver_name) {
          const key = j.driver_name.toLowerCase().trim();
          if (!key) continue;
          const arr = workloadByName.get(key) ?? [];
          arr.push(j);
          workloadByName.set(key, arr);
        }
      }

      const thirtyDaysMs = 30 * 86400_000;

      let rows: DriverControlRow[] = (drivers ?? []).map((d) => {
        // Prefer FK match
        const fkJobs = workloadById.get(d.id);
        const nameKey = (d.display_name || d.full_name || "").toLowerCase().trim();
        const nameJobs = !fkJobs ? workloadByName.get(nameKey) : undefined;
        const matchedJobs = fkJobs ?? nameJobs;
        const linkType: "fk" | "name" | null = fkJobs ? "fk" : nameJobs ? "name" : null;

        const latest = matchedJobs?.[0]; // already sorted by updated_at desc
        const hasStaleJob = matchedJobs?.some((j) => isJobStale({ status: j.status, updated_at: j.updated_at })) ?? false;

        return {
          ...d,
          activeJobCount: matchedJobs?.length ?? 0,
          latestJobReg: latest?.vehicle_reg ?? null,
          latestJobStatus: latest?.status ?? null,
          hasStaleJob,
          workloadLinkType: linkType,
          missingPhone: !d.phone,
          missingTradePlate: !d.trade_plate_number,
        };
      });

      // Apply filter
      if (filter === "active") rows = rows.filter((r) => r.is_active);
      else if (filter === "inactive") rows = rows.filter((r) => !r.is_active);
      else if (filter === "with-workload") rows = rows.filter((r) => r.activeJobCount > 0);
      else if (filter === "no-workload") rows = rows.filter((r) => r.activeJobCount === 0);
      else if (filter === "licence-expiring") rows = rows.filter((r) => isLicenceExpiringSoon(r.licence_expiry));
      else if (filter === "missing-plate") rows = rows.filter((r) => r.missingTradePlate && r.is_active);

      if (search.trim()) {
        const s = search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.full_name.toLowerCase().includes(s) ||
            r.display_name?.toLowerCase().includes(s) ||
            r.phone?.toLowerCase().includes(s) ||
            r.trade_plate_number?.toLowerCase().includes(s)
        );
      }

      return rows;
    },
    staleTime: 30_000,
  });
}

export function useDriversKpis() {
  return useQuery({
    queryKey: ["control-drivers-kpis"],
    queryFn: async () => {
      const thirtyDays = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
      const [totalRes, activeRes, expiringRes, missingPlateRes] = await Promise.all([
        supabase.from("driver_profiles").select("id", { count: "exact", head: true }),
        supabase.from("driver_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("driver_profiles").select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .not("licence_expiry", "is", null)
          .lte("licence_expiry", thirtyDays),
        supabase.from("driver_profiles").select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .is("trade_plate_number", null),
      ]);
      return {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        licenceExpiring: expiringRes.count ?? 0,
        missingPlate: missingPlateRes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function isLicenceExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now() + 30 * 86400_000;
}
