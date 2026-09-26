/**
 * Data hooks for the Compliance Control Page.
 * Queries inspections, damage_items, and jobs for compliance KPIs.
 *
 * Contracts (see lifecycle-integrity.test.ts):
 *  - active evidence only: archived_at IS NULL on inspections/damage_items
 *  - only status = 'completed' counts as completed work
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, subMonths } from "date-fns";

export type CompliancePeriod = "30d" | "90d" | "12m" | "all";

export const COMPLIANCE_PERIODS: { value: CompliancePeriod; label: string; short: string }[] = [
  { value: "30d", label: "Last 30 days", short: "30d" },
  { value: "90d", label: "Last 90 days", short: "90d" },
  { value: "12m", label: "Last 12 months", short: "12m" },
  { value: "all", label: "All time", short: "all time" },
];

// 12 months, not 30 days: with a quiet spell of a few weeks a 30-day window
// zeroes every KPI and the page reads as broken rather than "no recent work".
export const DEFAULT_COMPLIANCE_PERIOD: CompliancePeriod = "12m";

export function isCompliancePeriod(v: unknown): v is CompliancePeriod {
  return v === "30d" || v === "90d" || v === "12m" || v === "all";
}

/** ISO lower bound for a period, or null for "all time". */
export function periodSince(period: CompliancePeriod, now: Date = new Date()): string | null {
  switch (period) {
    case "30d":
      return subDays(now, 30).toISOString();
    case "90d":
      return subDays(now, 90).toISOString();
    case "12m":
      return subMonths(now, 12).toISOString();
    case "all":
      return null;
  }
}

/** KPIs for the selected period: inspection count, damage count, compliance rate. */
export function useComplianceKpis(period: CompliancePeriod) {
  return useQuery({
    queryKey: ["control", "compliance", "kpis", period],
    queryFn: async () => {
      const since = periodSince(period);

      let inspQ = (supabase
        .from("inspections")
        .select("id", { count: "exact", head: true }) as any)
        .is("archived_at", null);
      if (since) inspQ = inspQ.gte("created_at", since);
      const { count: inspectionCount, error: inspErr } = await inspQ;
      if (inspErr) throw inspErr;

      let dmgQ = (supabase
        .from("damage_items")
        .select("id", { count: "exact", head: true }) as any)
        .is("archived_at", null);
      if (since) dmgQ = dmgQ.gte("created_at", since);
      const { count: damageCount, error: dmgErr } = await dmgQ;
      if (dmgErr) throw dmgErr;

      // Compliance rate: completed jobs with BOTH inspections / all completed
      // jobs in the period. pod_ready / delivery_complete are review states
      // and must not pollute completion metrics.
      let jobsQ = supabase
        .from("jobs")
        .select("id, has_pickup_inspection, has_delivery_inspection")
        .eq("status", "completed")
        .eq("is_hidden", false)
        .not("completed_at", "is", null);
      if (since) jobsQ = jobsQ.gte("completed_at", since);
      const { data: completedJobs, error: jobsErr } = await jobsQ;
      if (jobsErr) throw jobsErr;

      const total = completedJobs?.length ?? 0;
      const compliant =
        completedJobs?.filter((j) => j.has_pickup_inspection && j.has_delivery_inspection).length ?? 0;
      const complianceRate = total > 0 ? Math.round((compliant / total) * 100) : null;

      return {
        inspectionCount: inspectionCount ?? 0,
        damageCount: damageCount ?? 0,
        completedCount: total,
        nonCompliantCount: total - compliant,
        complianceRate,
      };
    },
    staleTime: 30_000,
  });
}

export interface RecentInspectionRow {
  id: string;
  type: string;
  has_damage: boolean;
  created_at: string;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_model: string;
  job_id: string;
  job_number: string | null;
}

/** Latest 20 active inspections joined with their job's vehicle. */
export function useRecentInspections() {
  return useQuery({
    queryKey: ["control", "compliance", "recentInspections"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("inspections")
        .select(
          "id, type, has_damage, created_at, job_id, jobs!inner(vehicle_reg, vehicle_make, vehicle_model, external_job_number)",
        ) as any)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        type: row.type,
        has_damage: row.has_damage,
        created_at: row.created_at,
        job_id: row.job_id,
        job_number: row.jobs?.external_job_number ?? null,
        vehicle_reg: row.jobs?.vehicle_reg ?? "—",
        vehicle_make: row.jobs?.vehicle_make ?? "",
        vehicle_model: row.jobs?.vehicle_model ?? "",
      })) as RecentInspectionRow[];
    },
    staleTime: 30_000,
  });
}

export interface DamageReportRow {
  id: string;
  area: string | null;
  item: string | null;
  damage_types: string[] | null;
  notes: string | null;
  created_at: string;
  inspection_id: string;
  inspection_type: string | null;
  job_id: string | null;
  vehicle_reg: string;
  job_number: string | null;
}

/**
 * Latest 20 active damage reports, joined through the inspection to the job
 * so each row can name the vehicle and link to the job's POD (which shows
 * the damage photos).
 */
export function useDamageReports() {
  return useQuery({
    queryKey: ["control", "compliance", "damageReports"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("damage_items")
        .select(
          "id, area, item, damage_types, notes, created_at, inspection_id, inspections!inner(type, job_id, jobs!inner(vehicle_reg, external_job_number))",
        ) as any)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        area: row.area,
        item: row.item,
        damage_types: row.damage_types,
        notes: row.notes,
        created_at: row.created_at,
        inspection_id: row.inspection_id,
        inspection_type: row.inspections?.type ?? null,
        job_id: row.inspections?.job_id ?? null,
        vehicle_reg: row.inspections?.jobs?.vehicle_reg ?? "—",
        job_number: row.inspections?.jobs?.external_job_number ?? null,
      })) as DamageReportRow[];
    },
    staleTime: 30_000,
  });
}

export interface MissingInspectionJobRow {
  id: string;
  vehicle_reg: string;
  job_number: string | null;
  completed_at: string;
  missing_pickup: boolean;
  missing_delivery: boolean;
}

/**
 * Completed jobs in the period that are missing a pickup and/or delivery
 * inspection — exactly the jobs dragging the compliance rate down, so the
 * rate KPI has something actionable behind it.
 */
export function useJobsMissingInspections(period: CompliancePeriod) {
  return useQuery({
    queryKey: ["control", "compliance", "missingInspections", period],
    queryFn: async () => {
      const since = periodSince(period);
      let q = supabase
        .from("jobs")
        .select("id, vehicle_reg, external_job_number, completed_at, has_pickup_inspection, has_delivery_inspection")
        .eq("status", "completed")
        .eq("is_hidden", false)
        .not("completed_at", "is", null)
        .or(
          "has_pickup_inspection.is.false,has_pickup_inspection.is.null,has_delivery_inspection.is.false,has_delivery_inspection.is.null",
        )
        .order("completed_at", { ascending: false })
        .limit(50);
      if (since) q = q.gte("completed_at", since);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((j) => ({
        id: j.id,
        vehicle_reg: j.vehicle_reg ?? "—",
        job_number: j.external_job_number ?? null,
        completed_at: j.completed_at as string,
        missing_pickup: !j.has_pickup_inspection,
        missing_delivery: !j.has_delivery_inspection,
      })) as MissingInspectionJobRow[];
    },
    staleTime: 30_000,
  });
}
