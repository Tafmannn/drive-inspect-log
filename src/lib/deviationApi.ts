/**
 * Phase 4 — Deviation governance API.
 * Logs out-of-sequence job access with mandatory reasons.
 */
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "./orgHelper";

export const DEVIATION_REASONS = [
  "Customer reprioritised",
  "Site unavailable",
  "Waiting for paperwork",
  "Vehicle not ready",
  "Routing issue",
  "Other",
] as const;

export type DeviationReason = typeof DEVIATION_REASONS[number];

export interface DeviationEntry {
  id: string;
  job_id: string;
  driver_id: string | null;
  recommended_job_id: string | null;
  reason: string;
  notes: string | null;
  created_at: string;
}

export async function logDeviation(params: {
  jobId: string;
  recommendedJobId: string | null;
  reason: string;
  notes?: string;
  driverId?: string;
}): Promise<void> {
  const orgId = await getOrgId();
  const { error } = await supabase.from("job_deviation_log").insert({
    job_id: params.jobId,
    recommended_job_id: params.recommendedJobId,
    reason: params.reason,
    notes: params.notes ?? null,
    driver_id: params.driverId ?? null,
    org_id: orgId,
  } as any);
  if (error) throw error;
}

export async function getDeviationsForJob(jobId: string): Promise<DeviationEntry[]> {
  const { data, error } = await supabase
    .from("job_deviation_log")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeviationEntry[];
}
