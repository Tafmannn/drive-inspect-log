import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { Job, InspectionType, Inspection, DamageItem } from "@/lib/types";

export function useActiveJobs() {
  return useQuery({ queryKey: ["jobs", "active"], queryFn: api.listActiveJobs });
}

export function useCompletedJobs() {
  return useQuery({ queryKey: ["jobs", "completed"], queryFn: api.listCompletedJobs });
}

export function usePendingJobs() {
  return useQuery({ queryKey: ["jobs", "pending"], queryFn: api.listPendingJobs });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.getJobWithRelations(jobId),
    enabled: !!jobId,
  });
}

export function useInspection(jobId: string, type: InspectionType) {
  return useQuery({
    queryKey: ["inspection", jobId, type],
    queryFn: () => api.getInspection(jobId, type),
    enabled: !!jobId,
  });
}


export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createJob>[0]) => api.createJob(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: Partial<Job> }) =>
      api.updateJob(jobId, input),
    onSuccess: (_, { jobId }) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSubmitInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      type,
      inspection,
      damageItems,
    }: {
      jobId: string;
      type: InspectionType;
      inspection: Partial<Inspection>;
      damageItems: Array<Omit<DamageItem, "id" | "inspection_id" | "created_at">>;
    }) => api.submitInspection(jobId, type, inspection, damageItems),
    onSuccess: (_, { jobId }) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["inspection"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
// Dashboard counts – small helper hook so the dashboard can render
// without crashing, even if counts are simple for now.
export function useDashboardCounts() {
  return useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      // We keep this defensive and generic so it works with the
      // current jobs shape without needing any DB changes.
      const jobs = await api.listJobs();

      const totalJobs = jobs.length;

      const withPickup = jobs.filter((j: any) =>
        j?.inspections?.some((i: any) => i?.type === "pickup")
      ).length;

      const withDelivery = jobs.filter((j: any) =>
        j?.inspections?.some((i: any) => i?.type === "delivery")
      ).length;

      return {
        totalJobs,
        pickupCompleted: withPickup,
        deliveryCompleted: withDelivery,
        fullyCompleted: withDelivery,
        pendingPickup: totalJobs - withPickup,
        pendingDelivery: totalJobs - withDelivery,
      };
    },
  });
}