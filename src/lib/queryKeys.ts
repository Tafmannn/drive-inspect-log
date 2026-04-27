/**
 * Centralized React Query key factory.
 *
 * Why: 27 files were each defining their own ad-hoc query keys, which made
 * cross-cutting invalidation (e.g. "after job mutation, refresh every jobs
 * surface") brittle and easy to miss. The factory gives us:
 *   • A single source of truth per domain.
 *   • Consistent hierarchical keys so `qc.invalidateQueries({ queryKey: qk.jobs.all })`
 *     reliably refreshes every jobs query.
 *   • Type safety for filter shapes used in keys.
 *
 * Migration policy: new code MUST use this factory. Existing call sites are
 * being migrated incrementally — see Slice 6 of the remediation plan.
 */
import type { JobsFilter } from "@/features/control/hooks/useControlJobsData";

export const qk = {
  jobs: {
    all: ["jobs"] as const,
    /** Mobile admin queue page – grouped buckets */
    adminQueues: () => [...qk.jobs.all, "admin", "queues"] as const,
    adminQueueKpis: () => [...qk.jobs.all, "admin", "queue-kpis"] as const,
    /** Desktop control jobs – flat filtered list */
    controlList: (filter: JobsFilter) =>
      [...qk.jobs.all, "control", "list", filter] as const,
    controlKpis: () => [...qk.jobs.all, "control", "kpis"] as const,
    /** Detail (single job) */
    detail: (jobId: string) => [...qk.jobs.all, "detail", jobId] as const,
    /** POD review queue */
    podReview: () => [...qk.jobs.all, "pod-review"] as const,
    /** Active job (driver-facing) */
    activeJobs: () => [...qk.jobs.all, "active"] as const,
    completed: () => [...qk.jobs.all, "completed"] as const,
    pending: () => [...qk.jobs.all, "pending"] as const,
    counts: () => [...qk.jobs.all, "counts"] as const,
  },

  /**
   * Admin operational queues / KPIs — every key the Admin dashboard reads
   * from. Centralised so `invalidateAdminOperationalQueues` can bust them
   * all in one call after any admin mutation.
   */
  adminOps: {
    operationsBuckets: ["admin-operations-buckets"] as const,
    missingEvidence: ["admin-missing-evidence-count"] as const,
    complianceCounts: ["admin-compliance-counts"] as const,
    podReview: ["admin-pod-review"] as const,
    closureReviewQueue: ["closure-review-queue"] as const,
    closureReviewKpis: ["closure-review-kpis"] as const,
  },

  drivers: {
    all: ["drivers"] as const,
    admin: () => [...qk.drivers.all, "admin"] as const,
    controlList: (search: string, filter: string) =>
      [...qk.drivers.all, "control", "list", search, filter] as const,
    controlKpis: () => [...qk.drivers.all, "control", "kpis"] as const,
    gate: (userId: string | undefined) =>
      [...qk.drivers.all, "gate", userId ?? "anon"] as const,
  },

  users: {
    all: ["users"] as const,
    list: (filters?: Record<string, unknown>) =>
      [...qk.users.all, "list", filters ?? {}] as const,
    detail: (userId: string | null) =>
      [...qk.users.all, "detail", userId ?? "none"] as const,
    permissions: (userId: string | null) =>
      [...qk.users.all, "permissions", userId ?? "none"] as const,
  },

  clients: {
    all: ["clients"] as const,
    list: (search: string, includeArchived: boolean) =>
      [...qk.clients.all, "list", search, includeArchived] as const,
  },

  compliance: {
    all: ["compliance"] as const,
    kpis: () => [...qk.compliance.all, "kpis"] as const,
    recentInspections: () =>
      [...qk.compliance.all, "recent-inspections"] as const,
    outstandingDamage: () =>
      [...qk.compliance.all, "outstanding-damage"] as const,
    adminCounts: () => [...qk.compliance.all, "admin-counts"] as const,
  },

  attention: {
    all: ["attention-center"] as const,
    org: (filters: Record<string, unknown>) =>
      [...qk.attention.all, "org", filters] as const,
  },

  invoicing: {
    all: ["invoicing"] as const,
    eligibleJobs: () => [...qk.invoicing.all, "prep-eligible"] as const,
    /** Legacy ad-hoc key still used by useEligibleJobs/useCreateInvoice. */
    prepEligibleLegacy: ["invoice-prep-eligible"] as const,
  },

  control: {
    super: {
      kpis: ["control", "super-kpis"] as const,
      organisations: ["control", "organisations"] as const,
      allUsers: ["control", "all-users"] as const,
      recentAudit: ["control", "recent-audit"] as const,
      recentErrors: ["control", "recent-errors"] as const,
    },
  },
} as const;

/**
 * Helper: invalidate every query in a domain.
 *
 *   qc.invalidateQueries({ queryKey: qk.jobs.all });
 *
 * (Re-exported for discoverability — same as importing `qk` directly.)
 */
export type QueryKeyFactory = typeof qk;
