import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { getAllPendingUploads } from "@/lib/pendingUploads";
import { pushToSheet } from "@/lib/sheetSyncApi";
import type { Job, JobWithRelations, InspectionType, Inspection, DamageItem } from "@/lib/types";

// ─── Dashboard ───────────────────────────────────────────────────────

export interface DashboardCounts {
  /** Count of jobs shown in the "My Jobs" list */
  myJobs: number;
  /** Completed jobs within the last 14 days */
  completedLast14Days: number;
  /** Jobs completed but with pending/failed uploads */
  pendingUploads: number;
}

/**
 * Dashboard counts – each counter is derived from the exact same query
 * used by the corresponding list page, ensuring counters always match.
 */
export function useDashboardCounts() {
  return useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [active, completed, allPending] = await Promise.all([
        api.listActiveJobs(),
        api.listCompletedJobs(),
        getAllPendingUploads(),
      ]);
      const pendingUploads = allPending.filter(
        (u) => u.status === "pending" || u.status === "failed"
      ).length;
      return {
        myJobs: active.length,
        completedLast14Days: completed.length,
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
  });
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createJob>[0]) => api.createJob(input),
    onSuccess: (_data) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      // Auto-push new job to Google Sheet (fire-and-forget)
      if (_data?.id) pushToSheet([_data.id]).catch(() => {});
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: Partial<Job> }) =>
      api.updateJob(jobId, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["job", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      pushToSheet([vars.jobId]).catch(() => {});
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
      qc.invalidateQueries({ queryKey: ["job", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      pushToSheet([vars.jobId]).catch(() => {});
    },
  });
}
