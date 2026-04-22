import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { getPendingJobCount } from "@/lib/pendingUploads";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, JOB_STATUS } from "@/lib/statusConfig";
import { invalidateForEvent } from "@/lib/mutationEvents";
import type { Job, JobWithRelations, InspectionType, Inspection, DamageItem } from "@/lib/types";

// ─── Dashboard ───────────────────────────────────────────────────────

export interface DashboardCounts {
  myJobs: number;
  completedLast14Days: number;
  pendingUploads: number;
}

/**
 * Dashboard counts. When driverProfileId is provided, scopes counts
 * to only that driver's assigned jobs.
 */
export function useDashboardCounts(driverProfileId?: string | null) {
  return useQuery({
    queryKey: ["dashboard-counts", driverProfileId ?? "all"],
    queryFn: async () => {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      let activeQuery = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .in("status", ACTIVE_STATUSES as string[]);

      // Lifecycle contract: only `status = COMPLETED` counts as completed.
      // pod_ready / delivery_complete are review states, NOT terminal completion.
      // completed_at is metadata; status is the source of truth for business counts.
      let completedQuery = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .eq("status", JOB_STATUS.COMPLETED)
        .gte("completed_at", fourteenDaysAgo.toISOString());

      if (driverProfileId) {
        activeQuery = activeQuery.eq("driver_id", driverProfileId);
        completedQuery = completedQuery.eq("driver_id", driverProfileId);
      }

      const [activeRes, completedRes, pendingUploads] = await Promise.all([
        activeQuery,
        completedQuery,
        getPendingJobCount(),
      ]);

      return {
        myJobs: activeRes.count ?? 0,
        completedLast14Days: completedRes.count ?? 0,
        pendingUploads,
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
    staleTime: 30_000,
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

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.deleteJob(jobId),
    onSuccess: () => {
      invalidateForEvent(qc, "job_status_changed");
    },
  });
}

export function useAdminChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, newStatus, notes }: { jobId: string; newStatus: string; notes?: string }) =>
      api.adminChangeStatus(jobId, newStatus, notes),
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
      submissionSessionId,
    }: {
      jobId: string;
      type: InspectionType;
      inspectionPayload: Partial<Inspection>;
      damageItems: Array<Omit<DamageItem, "id" | "inspection_id" | "created_at">>;
      submissionSessionId?: string | null;
    }) => api.submitInspection(jobId, type, inspectionPayload, damageItems, submissionSessionId ?? null),
    onSuccess: (_data, vars) => {
      invalidateForEvent(qc, "inspection_submitted", [["job", vars.jobId]]);
    },
  });
}
