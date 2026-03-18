/**
 * Domain event → query invalidation groups.
 * Each event class refreshes all dependent read models.
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
    ["control-jobs"], ["control-jobs-kpis"],
    ["control-drivers"], ["control-drivers-kpis"],
    ["control-admin-kpis"], ["control-dispatch-board"],
    ["control-unassigned-queue"], ["control-overview-pod-queue"],
    ["control-recent-completed"],
    ["closure-review-queue"], ["closure-review-kpis"],
    // Admin mobile
    ["admin-job-queues"], ["admin-job-queue-kpis"],
    ["admin-missing-evidence-count"], ["admin-drivers"],
    // Driver
    ["jobs"], ["job"], ["dashboard-counts"],
  ],

  inspection_submitted: [
    ["job"], ["jobs"],
    ["dashboard-counts"],
    ["admin-job-queues"], ["admin-job-queue-kpis"],
    ["admin-missing-evidence-count"],
    ["control-jobs"], ["closure-review-queue"], ["closure-review-kpis"],
  ],

  expense_changed: [
    ["expenses"], ["expense-totals"],
    ["dashboard-counts"],
    ["admin-job-queues"],
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
    ["admin-job-queues"], ["admin-job-queue-kpis"],
    ["admin-missing-evidence-count"],
    ["control-jobs"], ["control-jobs-kpis"],
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
