/**
 * Domain event → query invalidation groups.
 *
 * Every mutation that affects an admin-visible queue MUST call
 * `invalidateForEvent(qc, <class>, [...extra])` in its onSuccess so the
 * Admin dashboard, queues, KPIs and per-job derived screens (POD report,
 * invoice prep, evidence health) all refresh from server state.
 *
 * IMPORTANT: keys must match the queryKey used in the corresponding hook.
 * useAdminJobQueues registers under ["jobs","admin","queues"] (qk.jobs.adminQueues).
 * useControlJobs registers under ["jobs","control","list",...] (qk.jobs.controlList).
 * TanStack Query uses prefix matching, so ["jobs","admin"] covers both queue + kpis.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";

const isDev =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: { DEV?: boolean } })?.env?.DEV === true;

type EventClass =
  | "driver_assignment_changed"
  | "inspection_submitted"
  | "expense_changed"
  | "onboarding_review_changed"
  | "deviation_logged"
  | "job_status_changed"
  | "pod_approved"
  | "evidence_resolved"
  | "evidence_override_applied"
  | "invoice_created";

/**
 * The full set of admin-operational query keys touched by *any* admin
 * mutation. Used by both the per-event maps below and the
 * `invalidateAdminOperationalQueues` helper. Centralised so dashboard
 * counters can never silently fall out of sync with an event class.
 */
const ADMIN_OPERATIONAL_KEYS: QueryKey[] = [
  // Mobile admin queues
  ["jobs", "admin", "queues"],
  ["jobs", "admin", "queue-kpis"],
  // Stage-6 dashboard buckets + supplemental counts
  ["admin-operations-buckets"],
  ["admin-missing-evidence-count"],
  ["admin-compliance-counts"],
  // POD review (mobile + control)
  ["admin-pod-review"],
  ["closure-review-queue"],
  ["closure-review-kpis"],
  // Control-centre lists & KPIs
  ["jobs", "control", "list"],
  ["jobs", "control", "kpis"],
  ["control-drivers"],
  ["control-drivers-kpis"],
  ["control-admin-kpis"],
  ["control-dispatch-board"],
  ["control-unassigned-queue"],
  ["control-overview-pod-queue"],
  ["control-recent-completed"],
  ["control", "compliance", "kpis"],
  // Attention / exceptions feed
  ["attention-center"],
  // Invoice prep readiness — when status flips to completed jobs become
  // eligible; when an evidence blocker clears they become billable.
  ["invoice-prep-eligible"],
  ["invoicing"],
  // Driver-facing surfaces also derived from the same job rows
  ["jobs"],
  ["job"],
  ["dashboard-counts"],
];

const EVENT_INVALIDATIONS: Record<EventClass, QueryKey[]> = {
  driver_assignment_changed: ADMIN_OPERATIONAL_KEYS,
  inspection_submitted: ADMIN_OPERATIONAL_KEYS,
  job_status_changed: ADMIN_OPERATIONAL_KEYS,
  pod_approved: ADMIN_OPERATIONAL_KEYS,
  evidence_resolved: ADMIN_OPERATIONAL_KEYS,
  evidence_override_applied: ADMIN_OPERATIONAL_KEYS,
  invoice_created: [
    ["invoice-prep-eligible"],
    ["invoicing"],
    ["jobs", "admin", "queues"],
    ["jobs", "admin", "queue-kpis"],
    ["admin-operations-buckets"],
    ["jobs", "control", "list"],
    ["jobs", "control", "kpis"],
  ],

  // Narrower events — kept as-is to avoid over-invalidating.
  expense_changed: [
    ["expenses"],
    ["expense-totals"],
    ["dashboard-counts"],
    ["jobs", "admin", "queues"],
    ["control-finance"],
  ],

  onboarding_review_changed: [
    ["admin-onboarding"],
    ["admin-onboarding-detail"],
    ["admin-compliance-counts"],
  ],

  deviation_logged: [
    ["job-deviations"],
  ],
};

function logInvalidation(event: EventClass, keys: QueryKey[]) {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.debug(
    `[mutationEvents] event=${event} invalidating ${keys.length} key(s)`,
    keys,
  );
}

export function invalidateForEvent(
  qc: QueryClient,
  event: EventClass,
  extraKeys?: QueryKey[],
) {
  const keys = EVENT_INVALIDATIONS[event] ?? [];
  for (const key of keys) {
    qc.invalidateQueries({ queryKey: key });
  }
  if (extraKeys) {
    for (const key of extraKeys) {
      qc.invalidateQueries({ queryKey: key });
    }
  }
  logInvalidation(event, [...keys, ...(extraKeys ?? [])]);
}

/**
 * Single entry point any admin-side mutation can call to refresh every
 * dashboard surface (counters, queues, per-job derived screens).
 *
 * If `jobId` is provided, the per-job detail caches are also bumped so the
 * Job Detail / POD Report / Invoice Prep / Evidence Health screens pull
 * fresh server state — preventing stale "still in queue" UI after a
 * successful mutation.
 *
 * Evidence Health, POD readiness and Invoice readiness are derived
 * client-side from the job + inspections rows, so invalidating
 * `["job", id]` and `["jobs","detail",id]` is sufficient — they re-derive
 * from the fresh job snapshot. If those derivations ever move server-side
 * the corresponding keys can be added here without touching call sites.
 */
export function invalidateAdminOperationalQueues(
  qc: QueryClient,
  jobId?: string | null,
) {
  for (const key of ADMIN_OPERATIONAL_KEYS) {
    qc.invalidateQueries({ queryKey: key });
  }
  if (jobId) {
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    qc.invalidateQueries({ queryKey: ["jobs", "detail", jobId] });
    // Future-proof: if a server-side readiness query is introduced, add it
    // here so callers don't need to remember a second invalidation.
    qc.invalidateQueries({ queryKey: ["evidence-health", jobId] });
    qc.invalidateQueries({ queryKey: ["pod-readiness", jobId] });
    qc.invalidateQueries({ queryKey: ["invoice-readiness", jobId] });
  }
  if (isDev) {
    // eslint-disable-next-line no-console
    console.debug(
      `[mutationEvents] invalidateAdminOperationalQueues jobId=${jobId ?? "—"}`,
    );
  }
}
