/**
 * Domain event → query invalidation groups.
 * Each event class refreshes all dependent read models.
 *
 * IMPORTANT: keys must match the queryKey used in the corresponding hook.
 * useAdminJobQueues registers under ["jobs","admin","queues"] (qk.jobs.adminQueues).
 * useControlJobs registers under ["jobs","control","list",...] (qk.jobs.controlList).
 * TanStack Query uses prefix matching, so ["jobs","admin"] covers both queue + kpis.
 */
import type { QueryClient } from "@tanstack/react-query";

type EventClass =
  | "driver_assignment_changed"
  | "inspection_submitted"
  | "expense_changed"
  | "onboarding_review_changed"
  | "deviation_logged"
  | "job_status_changed";

const EVENT_INVALIDATIONS: Record<EventClass, string[][]> = {
  driver_assignment_changed: [
    // Control surfaces
    ["jobs", "control", "list"], ["jobs", "control", "kpis"],
    ["control-drivers"], ["control-drivers-kpis"],
    ["control-admin-kpis"], ["control-dispatch-board"],
    ["control-unassigned-queue"], ["control-overview-pod-queue"],
    ["control-recent-completed"],
    ["closure-review-queue"], ["closure-review-kpis"],
    // Admin mobile
    ["jobs", "admin", "queues"], ["jobs", "admin", "queue-kpis"],
    ["admin-missing-evidence-count"], ["admin-drivers"],
    // Driver
    ["jobs"], ["job"], ["dashboard-counts"],
  ],

  inspection_submitted: [
    ["job"], ["jobs"],
    ["dashboard-counts"],
    ["jobs", "admin", "queues"], ["jobs", "admin", "queue-kpis"],
    ["admin-missing-evidence-count"],
    ["jobs", "control", "list"], ["closure-review-queue"], ["closure-review-kpis"],
  ],

  expense_changed: [
    ["expenses"], ["expense-totals"],
    ["dashboard-counts"],
    ["jobs", "admin", "queues"],
    ["control-finance"],
  ],

  onboarding_review_changed: [
    ["admin-onboarding"], ["admin-onboarding-detail"],
    ["admin-compliance-counts"],
  ],

  deviation_logged: [
    ["job-deviations"],
  ],

  job_status_changed: [
    ["job"], ["jobs"],
    ["dashboard-counts"],
    ["jobs", "admin", "queues"], ["jobs", "admin", "queue-kpis"],
    ["admin-missing-evidence-count"],
    ["jobs", "control", "list"], ["jobs", "control", "kpis"],
    ["closure-review-queue"], ["closure-review-kpis"],
    ["admin-pod-review"],
    ["attention-center"],
  ],
};

export function invalidateForEvent(qc: QueryClient, event: EventClass, extraKeys?: string[][]) {
  const keys = EVENT_INVALIDATIONS[event] ?? [];
  for (const key of keys) {
    qc.invalidateQueries({ queryKey: key });
  }
  if (extraKeys) {
    for (const key of extraKeys) {
      qc.invalidateQueries({ queryKey: key });
    }
  }
}
