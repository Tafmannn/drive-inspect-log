/**
 * Data hooks for the Drivers Control Page.
 * Queries driver_profiles + derives workload from jobs.
 *
 * PREFER-READ: Uses jobs.driver_id FK join for workload where available.
 * FALLBACK-READ: Falls back to driver_name matching for legacy rows with null driver_id.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES } from "@/lib/statusConfig";

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
  // derived
  activeJobCount: number;
  latestJobReg: string | null;
}

export function useControlDrivers(search: string) {
  return useQuery({
    queryKey: ["control-drivers", search],
    queryFn: async () => {
      // Fetch drivers
      const { data: drivers, error: dErr } = await supabase
        .from("driver_profiles")
        .select("id, user_id, full_name, display_name, phone, is_active, licence_expiry, trade_plate_number, employment_type, created_at")
        .order("full_name", { ascending: true })
        .limit(200);
      if (dErr) throw dErr;

      // Fetch active jobs — include driver_id + driver_name for hybrid matching
      const { data: jobs, error: jErr } = await supabase
        .from("jobs")
        .select("driver_id, driver_name, vehicle_reg, updated_at")
        .eq("is_hidden", false)
        .in("status", ACTIVE_STATUSES as string[])
        .order("updated_at", { ascending: false })
        .limit(500);
      if (jErr) throw jErr;

      // Build workload map keyed by driver_profile.id (preferred) with name fallback
      const workloadById = new Map<string, { count: number; latestReg: string | null }>();
      const workloadByName = new Map<string, { count: number; latestReg: string | null }>();

      for (const j of jobs ?? []) {
        // Prefer FK-based linking
        if (j.driver_id) {
          const existing = workloadById.get(j.driver_id);
          if (existing) {
            existing.count++;
          } else {
            workloadById.set(j.driver_id, { count: 1, latestReg: j.vehicle_reg });
          }
        } else if (j.driver_name) {
          // Legacy fallback: name-based matching for rows without driver_id
          const key = j.driver_name.toLowerCase().trim();
          if (!key) continue;
          const existing = workloadByName.get(key);
          if (existing) {
            existing.count++;
          } else {
            workloadByName.set(key, { count: 1, latestReg: j.vehicle_reg });
          }
        }
      }

      let rows: DriverControlRow[] = (drivers ?? []).map((d) => {
        // Prefer FK match by driver_profile.id
        const fkMatch = workloadById.get(d.id);
        if (fkMatch) {
          return { ...d, activeJobCount: fkMatch.count, latestJobReg: fkMatch.latestReg };
        }
        // Fallback: name-based match for legacy jobs
        const nameKey = (d.display_name || d.full_name || "").toLowerCase().trim();
        const nameMatch = workloadByName.get(nameKey);
        return {
          ...d,
          activeJobCount: nameMatch?.count ?? 0,
          latestJobReg: nameMatch?.latestReg ?? null,
        };
      });

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
      const [totalRes, activeRes, expiringRes] = await Promise.all([
        supabase.from("driver_profiles").select("id", { count: "exact", head: true }),
        supabase.from("driver_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("driver_profiles").select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .not("licence_expiry", "is", null)
          .lte("licence_expiry", new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)),
      ]);
      return {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        licenceExpiring: expiringRes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
