/**
 * operationsBuckets — Stage 6 operational bucket classifier.
 *
 * Pure function. Categorises a list of admin-visible jobs into the
 * operational buckets shown on the Admin Dashboard's command-centre panel.
 *
 * Critical rules (do not duplicate elsewhere):
 *   - All status / readiness logic is delegated to the shared brains:
 *       evaluateEvidenceHealth, evaluateInvoiceReadiness.
 *     This file only routes a job into one or more buckets — it never
 *     re-derives readiness on its own.
 *   - A job blocked by red/critical evidence must NEVER appear as
 *     ready_to_close, ready_to_invoice, or completed_not_invoiced "OK".
 *   - pod_ready / delivery_complete must NEVER appear as invoice-ready
 *     (the invoiceReadiness brain already enforces this; we just respect
 *     its `ready` boolean).
 *   - Cancelled jobs only appear in the cancelled bucket.
 *   - A single job may appear in multiple operational buckets (e.g. a
 *     completed job with a failed upload is both "completed_not_invoiced"
 *     and "failed_uploads"); but never in mutually exclusive ones
 *     (ready_to_invoice ↔ blocked_evidence is mutually exclusive by
 *     construction).
 */

import {
  evaluateEvidenceHealth,
  type EvidenceHealthResult,
} from "./evidenceHealth";
import {
  evaluateInvoiceReadiness,
  type InvoiceReadinessJob,
  type InvoiceReadinessResult,
} from "./invoiceReadiness";
import type { Inspection, Photo } from "./types";

export type BucketKey =
  | "todays_active"
  | "needs_driver_action"
  | "needs_admin_review"
  | "blocked_evidence"
  | "ready_to_close"
  | "ready_to_invoice"
  | "completed_not_invoiced"
  | "failed_uploads"
  | "stale_run_risk"
  | "missing_signatures"
  | "weak_pod"
  | "cancelled_archived";

export type BucketPriority = "critical" | "high" | "medium" | "low";

export interface BucketDef {
  key: BucketKey;
  label: string;
  priority: BucketPriority;
  /** Admin-friendly explanation of WHY this bucket matters. */
  reason: string;
  /**
   * Optional deep-link target. Buckets without a single direct target
   * (e.g. dynamic per-job actions) leave this undefined and the UI links
   * to the filtered jobs queue instead.
   */
  defaultRoute?: string;
}

export const BUCKET_DEFS: Record<BucketKey, BucketDef> = {
  todays_active: {
    key: "todays_active",
    label: "Today's active jobs",
    priority: "medium",
    reason: "Jobs scheduled for today or currently in progress.",
    defaultRoute: "/admin/jobs?filter=active",
  },
  needs_driver_action: {
    key: "needs_driver_action",
    label: "Jobs needing driver action",
    priority: "high",
    reason: "Awaiting a driver step (assign, pickup, transit, delivery).",
    defaultRoute: "/admin/jobs?filter=driver",
  },
  needs_admin_review: {
    key: "needs_admin_review",
    label: "Jobs needing admin review",
    priority: "high",
    reason: "POD ready or delivery complete — admin must review and close.",
    defaultRoute: "/admin/jobs?filter=review",
  },
  blocked_evidence: {
    key: "blocked_evidence",
    label: "Jobs blocked by evidence",
    priority: "critical",
    reason: "Red or critical evidence — cannot close or invoice safely.",
    defaultRoute: "/admin/jobs?filter=evidence",
  },
  ready_to_close: {
    key: "ready_to_close",
    label: "Jobs ready to close",
    priority: "high",
    reason: "Both inspections present, evidence safe, awaiting POD review.",
    defaultRoute: "/admin/jobs?filter=review",
  },
  ready_to_invoice: {
    key: "ready_to_invoice",
    label: "Jobs ready to invoice",
    priority: "medium",
    reason: "Completed, evidence clean, client linked, price set.",
    defaultRoute: "/admin/finance?filter=ready",
  },
  completed_not_invoiced: {
    key: "completed_not_invoiced",
    label: "Completed but not invoiced",
    priority: "medium",
    reason: "Finance follow-up: completed jobs without an invoice.",
    defaultRoute: "/admin/finance?filter=uninvoiced",
  },
  failed_uploads: {
    key: "failed_uploads",
    label: "Jobs with failed uploads",
    priority: "critical",
    reason: "Pending uploads failed — evidence may be incomplete.",
    defaultRoute: "/uploads",
  },
  stale_run_risk: {
    key: "stale_run_risk",
    label: "Jobs with stale-run risk",
    priority: "high",
    reason: "Evidence from a previous run still attached after reopen.",
    defaultRoute: "/admin/jobs?filter=evidence",
  },
  missing_signatures: {
    key: "missing_signatures",
    label: "Jobs with missing signatures",
    priority: "high",
    reason: "Driver or customer signature missing on an inspection.",
    defaultRoute: "/admin/jobs?filter=evidence",
  },
  weak_pod: {
    key: "weak_pod",
    label: "Jobs with weak POD",
    priority: "medium",
    reason: "Amber evidence — usable but worth tightening before invoice.",
    defaultRoute: "/admin/jobs?filter=review",
  },
  cancelled_archived: {
    key: "cancelled_archived",
    label: "Cancelled / archived jobs",
    priority: "low",
    reason: "Read-only. No action required.",
    defaultRoute: "/admin/jobs?filter=cancelled",
  },
};

/** Subset of the jobs row we need for bucket classification. */
export interface BucketJob extends InvoiceReadinessJob {
  /** Truthy when admin has flagged the row as hidden/archived. */
  is_hidden?: boolean | null | undefined;
  job_date?: string | null | undefined;
  updated_at?: string | null | undefined;
  driver_id?: string | null | undefined;
  has_pickup_inspection?: boolean | null | undefined;
  has_delivery_inspection?: boolean | null | undefined;
  /** Pre-counted failed/blocked uploads for this job, if known. */
  failedUploadCount?: number;
  blockedUploadCount?: number;
}

export interface BucketJobInput {
  job: BucketJob;
  alreadyInvoiced?: boolean;
}

export interface BucketJobAssignment {
  job: BucketJob;
  buckets: BucketKey[];
  evidence: EvidenceHealthResult;
  invoice: InvoiceReadinessResult;
}

export interface BucketSummary {
  key: BucketKey;
  def: BucketDef;
  count: number;
  jobIds: string[];
}

export interface BucketingResult {
  assignments: BucketJobAssignment[];
  buckets: BucketSummary[];
  /** Convenience map for direct lookup. */
  byKey: Record<BucketKey, BucketSummary>;
}

const ACTIVE_DRIVER_STATUSES = new Set([
  "ready_for_pickup",
  "assigned",
  "pickup_complete",
  "in_transit",
  "delivery_in_progress",
]);

const ADMIN_REVIEW_STATUSES = new Set([
  "pod_ready",
  "delivery_complete",
  "awaiting_review",
]);

const TERMINAL_STATUSES = new Set(["completed", "closed"]);

function isCancelled(status: string | null | undefined): boolean {
  return status === "cancelled";
}

function isToday(dateStr: string | null | undefined, now: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function inspectionMissingSignature(i: Inspection | undefined): boolean {
  if (!i) return false;
  return !i.driver_signature_url || !i.customer_signature_url;
}

function classifyOne(input: BucketJobInput, now: Date): BucketJobAssignment {
  const job = input.job;
  const status = job.status ?? null;
  const buckets = new Set<BucketKey>();

  // Evidence health — single source of truth.
  const evidence = evaluateEvidenceHealth({
    currentRunId: job.current_run_id ?? null,
    photos: (job.photos ?? null) as Photo[] | null,
    inspections: (job.inspections ?? null) as Inspection[] | null,
    pendingUploads:
      (job.failedUploadCount ?? 0) > 0 || (job.blockedUploadCount ?? 0) > 0
        ? {
            failedCount: job.failedUploadCount ?? 0,
            blockedCount: job.blockedUploadCount ?? 0,
          }
        : null,
  });

  // Invoice readiness — single source of truth.
  const invoice = evaluateInvoiceReadiness({
    job,
    alreadyInvoiced: !!input.alreadyInvoiced,
    evidenceHealth: evidence,
  });

  // Cancelled / archived: short-circuit. No other bucket applies.
  if (isCancelled(status) || job.is_hidden) {
    buckets.add("cancelled_archived");
    return {
      job,
      buckets: Array.from(buckets),
      evidence,
      invoice,
    };
  }

  // Today's active jobs.
  const isActiveStatus =
    ACTIVE_DRIVER_STATUSES.has(status ?? "") ||
    ADMIN_REVIEW_STATUSES.has(status ?? "");
  if (isActiveStatus && isToday(job.job_date ?? null, now)) {
    buckets.add("todays_active");
  }

  // Driver action required.
  if (
    ACTIVE_DRIVER_STATUSES.has(status ?? "") ||
    !job.driver_id // unassigned needs driver action
  ) {
    if (!TERMINAL_STATUSES.has(status ?? "")) {
      buckets.add("needs_driver_action");
    }
  }

  // Admin review required.
  if (ADMIN_REVIEW_STATUSES.has(status ?? "")) {
    buckets.add("needs_admin_review");
  }

  // Evidence-driven buckets — these run regardless of status (except
  // cancelled, handled above) so admins see the full risk picture.
  const isRedOrCritical =
    evidence.level === "red" || evidence.level === "critical";

  const failedUpload = evidence.blockers.some(
    (b) => b.code === "failed_uploads",
  );
  const staleRun = evidence.blockers.some(
    (b) => b.code === "stale_run_evidence" || b.code === "evidence_mismatch",
  );

  // Missing signatures — check both inspections.
  const inspections = (job.inspections ?? []) as Inspection[];
  const pickup = inspections.find((i) => i.type === "pickup");
  const delivery = inspections.find((i) => i.type === "delivery");
  const missingSig =
    inspectionMissingSignature(pickup) || inspectionMissingSignature(delivery);

  if (failedUpload) buckets.add("failed_uploads");
  if (staleRun) buckets.add("stale_run_risk");
  if (missingSig && (pickup || delivery)) buckets.add("missing_signatures");

  if (isRedOrCritical) {
    buckets.add("blocked_evidence");
  } else if (evidence.level === "amber") {
    // Amber = weak POD (only meaningful once there is something to review).
    if (
      ADMIN_REVIEW_STATUSES.has(status ?? "") ||
      TERMINAL_STATUSES.has(status ?? "")
    ) {
      buckets.add("weak_pod");
    }
  }

  // Ready to close: admin review state AND evidence safe (not red/critical).
  if (
    ADMIN_REVIEW_STATUSES.has(status ?? "") &&
    !isRedOrCritical &&
    evidence.canCloseJob
  ) {
    buckets.add("ready_to_close");
  }

  // Invoice buckets — strictly delegated to invoiceReadiness.ready.
  if (invoice.ready) {
    buckets.add("ready_to_invoice");
  }

  // Completed but not invoiced (finance follow-up): completed status, not yet
  // invoiced. Independent of evidence colour — finance still needs to see
  // these. Ready vs blocked is communicated via the separate ready bucket.
  if (TERMINAL_STATUSES.has(status ?? "") && !input.alreadyInvoiced) {
    buckets.add("completed_not_invoiced");
  }

  return {
    job,
    buckets: Array.from(buckets),
    evidence,
    invoice,
  };
}

export function classifyJobsIntoBuckets(
  inputs: BucketJobInput[],
  opts: { now?: Date } = {},
): BucketingResult {
  const now = opts.now ?? new Date();
  const assignments = inputs.map((i) => classifyOne(i, now));

  const byKey = {} as Record<BucketKey, BucketSummary>;
  (Object.keys(BUCKET_DEFS) as BucketKey[]).forEach((k) => {
    byKey[k] = { key: k, def: BUCKET_DEFS[k], count: 0, jobIds: [] };
  });

  for (const a of assignments) {
    for (const k of a.buckets) {
      byKey[k].count += 1;
      byKey[k].jobIds.push(a.job.id);
    }
  }

  const buckets = (Object.keys(BUCKET_DEFS) as BucketKey[]).map((k) => byKey[k]);

  return { assignments, buckets, byKey };
}
