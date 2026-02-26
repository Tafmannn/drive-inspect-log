// Dashboard counts — single source of truth so tiles + screens stay in sync
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { getAllPendingUploads } from "@/lib/pendingUploads";
import type { JobWithRelations } from "@/lib/types";

export interface DashboardCounts {
  /** Jobs still in-progress (not fully completed OR have pending uploads) */
  activeJobs: number;
  /** Jobs completed within last 14 days and with no pending uploads */
  completedLast14Days: number;
  /** Total jobs in the system (for reference / future use) */
  totalJobs: number;
  /** Number of pending/failed local uploads */
  pendingUploads: number;
}

/**
 * A job is considered "fully completed" when:
 *  - it has both pickup & delivery inspections, and
 *  - there are no pending uploads for that job.
 */
function analyseJobs(jobs: JobWithRelations[]): DashboardCounts {
  const allPending = getAllPendingUploads();
  const now = new Date();
  const ms14Days = 14 * 24 * 60 * 60 * 1000;

  const pendingByJobId = new Map<string, number>();
  for (const u of allPending) {
    if (u.status === "pending" || u.status === "failed") {
      pendingByJobId.set(u.jobId, (pendingByJobId.get(u.jobId) ?? 0) + 1);
    }
  }

  let activeJobs = 0;
  let completedLast14Days = 0;

  for (const j of jobs) {
    const pickup = j.inspections?.find((i) => i.type === "pickup");
    const delivery = j.inspections?.find((i) => i.type === "delivery");
    const hasPending = (pendingByJobId.get(j.id) ?? 0) > 0;

    const isFullyCompleted = !!pickup && !!delivery && !hasPending;

    if (!isFullyCompleted || hasPending) {
      // Anything not fully complete (or blocked by pending uploads) is "active"
      activeJobs += 1;
    }

    if (isFullyCompleted) {
      // Use delivery inspection timestamp as "completion" time
      const completedAtRaw =
        (delivery as any)?.inspected_at ??
        (j as any).completed_at ??
        (j as any).updated_at ??
        null;

      if (completedAtRaw) {
        const completedAt = new Date(completedAtRaw);
        if (now.getTime() - completedAt.getTime() <= ms14Days) {
          completedLast14Days += 1;
        }
      }
    }
  }

  const pendingUploads = allPending.filter(
    (u) => u.status === "pending" || u.status === "failed"
  ).length;

  return {
    activeJobs,
    completedLast14Days,
    totalJobs: jobs.length,
    pendingUploads,
  };
}

/**
 * React hook used by the dashboard tiles.
 * It will never throw – it just falls back to zeros if the jobs query fails.
 */
export function useDashboardCounts(): DashboardCounts {
  return useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const jobs = await api.listJobs();
      return analyseJobs(jobs);
    },
    staleTime: 60_000, // 1 minute – fine for dashboard
  }).data ?? {
    activeJobs: 0,
    completedLast14Days: 0,
    totalJobs: 0,
    pendingUploads: 0,
  };
}