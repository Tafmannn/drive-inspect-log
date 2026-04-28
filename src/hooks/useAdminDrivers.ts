/**
 * Hook for Admin Drivers page.
 * Fetches driver profiles with active job counts and risk flags.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES } from "@/lib/statusConfig";

export interface AdminDriverRow {
  id: string;
  userId: string;
  fullName: string;
  displayName: string | null;
  phone: string | null;
  isActive: boolean;
  activeJobCount: number;
  latestJobReg: string | null;
  latestJobStatus: string | null;
  licenceExpiry: string | null;
  licenceExpiring: boolean;
  tradePlateNumber: string | null;
  missingPlate: boolean;
  // Raw completion-relevant fields (used by scoreDriver in lists/details)
  fullNameRaw: string | null;
  licenceNumber: string | null;
  rightToWork: string | null;
  homePostcode: string | null;
  payoutTerms: string | null;
  bankCaptured: boolean;
}

export type DriverFilter = "all" | "active" | "with-jobs" | "no-jobs" | "licence-expiring" | "missing-plate";

const LICENCE_WARNING_DAYS = 30;

export function useAdminDrivers() {
  return useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      // Fetch drivers and active jobs in parallel
      const [driversRes, jobsRes] = await Promise.all([
        supabase.from("driver_profiles")
          .select("id, user_id, full_name, display_name, phone, is_active, licence_expiry, licence_number, trade_plate_number, right_to_work, home_postcode, payout_terms, bank_captured")
          .order("full_name", { ascending: true }),
        supabase.from("jobs")
          .select("driver_id, vehicle_reg, status, updated_at")
          .eq("is_hidden", false)
          .in("status", ACTIVE_STATUSES as string[])
          .order("updated_at", { ascending: false })
          .limit(500),
      ]);

      if (driversRes.error) throw driversRes.error;

      const jobs = jobsRes.data ?? [];

      // Build driver → job aggregations
      const jobCountMap = new Map<string, number>();
      const latestJobMap = new Map<string, { reg: string; status: string }>();

      for (const j of jobs) {
        if (!j.driver_id) continue;
        jobCountMap.set(j.driver_id, (jobCountMap.get(j.driver_id) ?? 0) + 1);
        if (!latestJobMap.has(j.driver_id)) {
          latestJobMap.set(j.driver_id, { reg: j.vehicle_reg, status: j.status });
        }
      }

      const warningDate = new Date(Date.now() + LICENCE_WARNING_DAYS * 86400_000).toISOString().slice(0, 10);

      const rows: AdminDriverRow[] = (driversRes.data ?? []).map((d) => {
        const latest = latestJobMap.get(d.id);
        const licenceExpiring = !!d.licence_expiry && d.licence_expiry <= warningDate;
        const missingPlate = !d.trade_plate_number || d.trade_plate_number.trim() === "";

        return {
          id: d.id,
          userId: d.user_id,
          fullName: d.full_name || "Unnamed",
          displayName: d.display_name,
          phone: d.phone,
          isActive: d.is_active,
          activeJobCount: jobCountMap.get(d.id) ?? 0,
          latestJobReg: latest?.reg ?? null,
          latestJobStatus: latest?.status ?? null,
          licenceExpiry: d.licence_expiry,
          licenceExpiring,
          tradePlateNumber: d.trade_plate_number,
          missingPlate,
          fullNameRaw: d.full_name,
          licenceNumber: (d as any).licence_number ?? null,
          rightToWork: (d as any).right_to_work ?? null,
          homePostcode: (d as any).home_postcode ?? null,
          payoutTerms: (d as any).payout_terms ?? null,
          bankCaptured: !!(d as any).bank_captured,
        };
      });

      return rows;
    },
    staleTime: 30_000,
  });
}
