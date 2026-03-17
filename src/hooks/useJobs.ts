import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { getPendingJobCount } from "@/lib/pendingUploads";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES } from "@/lib/statusConfig";
import { invalidateForEvent } from "@/lib/mutationEvents";
import type { Job, JobWithRelations, InspectionType, Inspection, DamageItem } from "@/lib/types";

// ─── Dashboard ───────────────────────────────────────────────────────

export interface DashboardCounts {
  myJobs: number;
  completedLast14Days: number;
  pendingUploads: number;
}

export function useDashboardCounts() {
  return useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const [activeRes, completedRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ACTIVE_STATUSES as string[]),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .not("completed_at", "is", null)
          .gte("completed_at", fourteenDaysAgo.toISOString()),
      ]);

      return {
        myJobs: activeRes.count ?? 0,
        completedLast14Days: completedRes.count ?? 0,
        pendingUploads: getPendingJobCount(),
      } satisfies DashboardCounts;
    },
    staleTime: 60_000,
  });
}

// ─── Job lists ───────────────────────────────────────────────────────

export function useActiveJobs() {
  return useQuery({
    queryKey: ["jobs", "active"],
    queryFn: () => api.listActiveJobs(),
  });
}

export function useCompletedJobs() {
  return useQuery({
    queryKey: ["jobs", "completed"],
    queryFn: () => api.listCompletedJobs(),
  });
}

export function usePendingJobs() {
  return useQuery({
    queryKey: ["jobs", "pending"],
    queryFn: () => api.listPendingJobs(),
  });
}

// ─── Single job ──────────────────────────────────────────────────────

export function useJob(jobId: string) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.getJobWithRelations(jobId),
    enabled: !!jobId,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createJob>[0]) => api.createJob(input),
    onSuccess: () => invalidateForEvent(qc, "job_status_changed"),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: Partial<Job> }) =>
      api.updateJob(jobId, input),
    onSuccess: (_data, vars) => {
      invalidateForEvent(qc, "job_status_changed", [["job", vars.jobId]]);
    },
  });
}

export function useSubmitInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      type,
      inspectionPayload,
      damageItems,
    }: {
      jobId: string;
      type: InspectionType;
      inspectionPayload: Partial<Inspection>;
      damageItems: Array<Omit<DamageItem, "id" | "inspection_id" | "created_at">>;
    }) => api.submitInspection(jobId, type, inspectionPayload, damageItems),
    onSuccess: (_data, vars) => {
      invalidateForEvent(qc, "inspection_submitted", [["job", vars.jobId]]);
    },
  });
}
