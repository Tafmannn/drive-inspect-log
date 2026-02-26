import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { getAllPendingUploads } from "@/lib/pendingUploads";
import type { Job, JobWithRelations, InspectionType, Inspection, DamageItem } from "@/lib/types";

// ─── Dashboard ───────────────────────────────────────────────────────

export interface DashboardCounts {
  totalJobs: number;
  fullyCompleted: number;
  pendingPickup: number;
  pendingUploads: number;
}

export function useDashboardCounts() {
  return useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [active, completed, pending, allPending] = await Promise.all([
        api.listJobs(),
        api.listCompletedJobs(),
        api.listPendingJobs(),
        getAllPendingUploads(),
      ]);
      const pendingUploads = allPending.filter(
        (u) => u.status === "pending" || u.status === "failed"
      ).length;
      return {
        totalJobs: active.length,
        fullyCompleted: completed.length,
        pendingPickup: pending.length,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
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
    },
  });
}
