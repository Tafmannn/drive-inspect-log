/**
 * Data hooks for the Drivers Control Page.
 * Queries driver_profiles + derives workload from jobs.
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

      // Fetch active jobs with driver assignment
      const { data: jobs, error: jErr } = await supabase
        .from("jobs")
        .select("driver_name, vehicle_reg, updated_at")
        .eq("is_hidden", false)
        .in("status", ACTIVE_STATUSES as string[])
        .not("driver_name", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (jErr) throw jErr;

      // Build workload map by driver_name (lowercase)
      const workload = new Map<string, { count: number; latestReg: string | null }>();
      for (const j of jobs ?? []) {
        const key = (j.driver_name ?? "").toLowerCase().trim();
        if (!key) continue;
        const existing = workload.get(key);
        if (existing) {
          existing.count++;
        } else {
          workload.set(key, { count: 1, latestReg: j.vehicle_reg });
        }
      }

      let rows: DriverControlRow[] = (drivers ?? []).map((d) => {
        const nameKey = (d.display_name || d.full_name || "").toLowerCase().trim();
        const w = workload.get(nameKey);
        return {
          ...d,
          activeJobCount: w?.count ?? 0,
          latestJobReg: w?.latestReg ?? null,
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
