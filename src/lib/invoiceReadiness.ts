/**
 * invoiceReadiness — Stage 5 invoice gating.
 *
 * Pure function. Decides whether a single job is invoice-ready and, if
 * not, returns precise human-readable blockers/warnings the UI can
 * surface in badges, banners, and disabled CTAs.
 *
 * Strict rules (from product brief):
 *   - Only jobs with status === 'completed'/'closed' are EVER eligible.
 *     Never: assigned, pickup_complete, delivery_complete, pod_ready,
 *     awaiting_review.
 *   - POD must have been reviewed (in our model: job.status === 'completed'
 *     is the on-platform proof of POD review — review confirmation drives
 *     completion via the validated complete_job RPC).
 *   - evidenceHealth must be green or amber. Red/critical blocks.
 *   - Client must be linked (client_id) OR at minimum have a client name +
 *     billing email/phone for legacy uninvoiced jobs.
 *   - total_price must be > 0.
 *   - Job must not already be invoiced (no row in invoice_items.job_id).
 *
 * Abort exception (the ONLY non-completed path): an 'aborted' job is invoice-ready
 * when its current Abort fee claim is explicitly approved for more than zero. No
 * inspection, photo or POD is required on that path, and the invoiceable amount is
 * the approved Abort fee, never the original price. Every other rule above is
 * unchanged for every other job.
 *
 * No side effects. No DB writes. The screen and createInvoice path use
 * this to gate the CTA and to render the precise blocker reason.
 */

import {
  evaluateEvidenceHealth,
  type EvidenceHealthResult,
} from "./evidenceHealth";
import type { Inspection, Photo } from "./types";

/** Statuses we are allowed to invoice from. */
export const INVOICEABLE_STATUSES = ["completed", "closed"] as const;

/** Statuses that are explicitly NOT invoice-ready, even if data is rich. */
export const NEVER_INVOICEABLE_STATUSES = [
  "draft",
  "ready_for_pickup",
  "assigned",
  "pickup_complete",
  "in_transit",
  "delivery_in_progress",
  "delivery_complete",
  "pod_ready",
  "awaiting_review",
  "cancelled",
] as const;

export type InvoiceBlockerCode =
  | "wrong_status"
  | "pod_not_reviewed"
  | "missing_price"
  | "missing_client"
  | "missing_billing_contact"
  | "missing_receipts"
  | "evidence_red_or_critical"
  | "already_invoiced"
  | "abort_not_confirmed"
  | "abort_fee_not_approved"
  | "abort_fee_rejected"
  | "abort_fee_nil";

export type InvoiceWarningCode =
  | "no_billing_email"
  | "evidence_amber"
  | "no_receipts_attached";

export interface InvoiceBlocker {
  code: InvoiceBlockerCode;
  message: string;
}

export interface InvoiceWarning {
  code: InvoiceWarningCode;
  message: string;
}

export interface InvoiceReadinessJob {
  id: string;
  status: string | null | undefined;
  total_price: number | null | undefined;
  client_id: string | null | undefined;
  client_name: string | null | undefined;
  client_company: string | null | undefined;
  client_email: string | null | undefined;
  client_phone?: string | null | undefined;
  current_run_id?: string | null | undefined;
  inspections?: Inspection[] | null | undefined;
  photos?: Photo[] | null | undefined;
  /**
   * Aborted jobs only: the job's CURRENT Abort (not reopened). Absent/null means
   * no confirmed Abort is known, which blocks.
   */
  abort?: AbortInvoiceInfo | null;
}

export interface AbortInvoiceInfo {
  finance_status: "pending_review" | "approved" | "rejected";
  approved_amount: number | null;
  reopened_at?: string | null;
}

/**
 * What this job would be invoiced for: the approved Abort fee for an aborted job
 * (null while not approved), otherwise the job's agreed price.
 */
export function invoiceableAmount(job: Pick<InvoiceReadinessJob, "status" | "total_price" | "abort">): number | null {
  if (job.status === "aborted") {
    const a = job.abort;
    if (!a || a.reopened_at || a.finance_status !== "approved" || a.approved_amount == null) return null;
    return Number(a.approved_amount);
  }
  return job.total_price == null ? null : Number(job.total_price);
}

export interface InvoiceReadinessInput {
  job: InvoiceReadinessJob;
  /** True when invoice_items already references this job_id. */
  alreadyInvoiced: boolean;
  /** Optional billable expense / receipt count. Used only for warnings. */
  receiptCount?: number;
  /**
   * Pre-computed evidence health (e.g. from podReadiness). When omitted we
   * compute it from job.inspections/job.photos so callers can pass a bare
   * job row without losing rigor.
   */
  evidenceHealth?: EvidenceHealthResult;
  /**
   * When true, treat the absence of any billable expenses as a hard block
   * rather than a warning. Defaults to false (the brief says "if that
   * feature exists" — we keep it advisory unless callers opt in).
   */
  requireReceipts?: boolean;
}

export interface InvoiceReadinessResult {
  /** True only when zero blockers. Warnings are allowed. */
  ready: boolean;
  /** Exact reason copy the UI can put on the disabled CTA. */
  primaryReason: string;
  blockers: InvoiceBlocker[];
  warnings: InvoiceWarning[];
  alreadyInvoiced: boolean;
  evidenceLevel: EvidenceHealthResult["level"] | "not_applicable";
}

function statusIsInvoiceable(status: string | null | undefined): boolean {
  if (!status) return false;
  return (INVOICEABLE_STATUSES as readonly string[]).includes(status);
}

function hasMeaningfulClient(j: InvoiceReadinessJob): boolean {
  if (j.client_id) return true;
  // Legacy unlinked jobs: require at least a name AND a contact channel.
  const hasName = !!(j.client_name?.trim() || j.client_company?.trim());
  const hasContact = !!(j.client_email?.trim() || j.client_phone?.trim());
  return hasName && hasContact;
}

/**
 * Pure invoice readiness evaluation. Always returns a fully populated
 * result so the UI can render badges deterministically.
 */
export function evaluateInvoiceReadiness(
  input: InvoiceReadinessInput,
): InvoiceReadinessResult {
  const { job, alreadyInvoiced, receiptCount, requireReceipts } = input;

  const blockers: InvoiceBlocker[] = [];
  const warnings: InvoiceWarning[] = [];

  // 1. Already invoiced — short-circuit. Never duplicate.
  if (alreadyInvoiced) {
    blockers.push({
      code: "already_invoiced",
      message: "Already invoiced",
    });
  }

  // 1b. Abort exception — its own rules, no POD / evidence requirements.
  if (job.status === "aborted") {
    return evaluateAbortReadiness(job, alreadyInvoiced, blockers, warnings);
  }

  // 2. Status gate. POD reviewed === job.status === 'completed' in our model.
  if (!statusIsInvoiceable(job.status)) {
    if (job.status === "pod_ready" || job.status === "awaiting_review") {
      blockers.push({
        code: "pod_not_reviewed",
        message: "Blocked: POD not reviewed",
      });
    } else {
      blockers.push({
        code: "wrong_status",
        message: `Blocked: job status is ${job.status ?? "unknown"} — must be completed`,
      });
    }
  }

  // 3. Price.
  const price = Number(job.total_price ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    blockers.push({
      code: "missing_price",
      message: "Blocked: missing price",
    });
  }

  // 4. Client linkage.
  if (!hasMeaningfulClient(job)) {
    if (!job.client_id && !job.client_name?.trim() && !job.client_company?.trim()) {
      blockers.push({
        code: "missing_client",
        message: "Blocked: missing client",
      });
    } else {
      blockers.push({
        code: "missing_billing_contact",
        message: "Blocked: client has no billing email or phone on file",
      });
    }
  } else if (!job.client_email?.trim()) {
    warnings.push({
      code: "no_billing_email",
      message: "No billing email on file — invoice will need manual delivery",
    });
  }

  // 5. Evidence health. Red/critical hard blocks; amber warns.
  const health =
    input.evidenceHealth ??
    evaluateEvidenceHealth({
      currentRunId: job.current_run_id ?? null,
      photos: job.photos ?? [],
      inspections: job.inspections ?? [],
    });

  if (health.level === "red" || health.level === "critical") {
    blockers.push({
      code: "evidence_red_or_critical",
      message: `Blocked: evidence issue (${health.level})`,
    });
  } else if (health.level === "amber") {
    warnings.push({
      code: "evidence_amber",
      message: "Evidence has warnings — review before sending",
    });
  }

  // 6. Receipts (advisory unless caller opts in).
  if ((receiptCount ?? 0) === 0) {
    warnings.push({
      code: "no_receipts_attached",
      message: "No expense receipts attached to this job",
    });
    if (requireReceipts) {
      // Promote to a blocker only when the caller opts in.
      blockers.push({
        code: "missing_receipts",
        message: "Blocked: receipts required for this client",
      });
    }
  }

  const ready = blockers.length === 0;
  const primaryReason = ready
    ? "Ready to invoice"
    : (blockers[0]?.message ?? "Blocked");

  return {
    ready,
    primaryReason,
    blockers,
    warnings,
    alreadyInvoiced,
    evidenceLevel: health.level,
  };
}

function clientBlockers(job: InvoiceReadinessJob, blockers: InvoiceBlocker[], warnings: InvoiceWarning[]) {
  if (!hasMeaningfulClient(job)) {
    if (!job.client_id && !job.client_name?.trim() && !job.client_company?.trim()) {
      blockers.push({ code: "missing_client", message: "Blocked: missing client" });
    } else {
      blockers.push({ code: "missing_billing_contact", message: "Blocked: client has no billing email or phone on file" });
    }
  } else if (!job.client_email?.trim()) {
    warnings.push({ code: "no_billing_email", message: "No billing email on file — invoice will need manual delivery" });
  }
}

function evaluateAbortReadiness(
  job: InvoiceReadinessJob,
  alreadyInvoiced: boolean,
  blockers: InvoiceBlocker[],
  warnings: InvoiceWarning[],
): InvoiceReadinessResult {
  const a = job.abort;
  if (!a || a.reopened_at) {
    blockers.push({ code: "abort_not_confirmed", message: "Blocked: no confirmed Abort on this job" });
  } else if (a.finance_status === "rejected") {
    blockers.push({ code: "abort_fee_rejected", message: "Abort fee rejected — nothing to invoice" });
  } else if (a.finance_status !== "approved") {
    blockers.push({ code: "abort_fee_not_approved", message: "Blocked: Abort fee awaiting approval" });
  } else if (!(Number(a.approved_amount ?? 0) > 0)) {
    blockers.push({ code: "abort_fee_nil", message: "Abort approved at £0 — nothing to invoice" });
  }
  clientBlockers(job, blockers, warnings);
  const ready = blockers.length === 0;
  return {
    ready,
    primaryReason: ready ? "Ready to invoice (Abort fee)" : (blockers[0]?.message ?? "Blocked"),
    blockers,
    warnings,
    alreadyInvoiced,
    // No evidence is required for an Abort; nothing about it blocks or warns.
    evidenceLevel: "not_applicable",
  };
}

/**
 * Convenience for the multi-job invoice prep screen: filter a list to
 * only invoice-ready jobs. The screen still surfaces blocked rows with
 * their reasons; this is for "select all ready" and totals.
 */
export function filterInvoiceReadyJobs<T extends InvoiceReadinessJob>(
  jobs: Array<{ job: T; alreadyInvoiced: boolean; receiptCount?: number }>,
): T[] {
  const out: T[] = [];
  for (const row of jobs) {
    const r = evaluateInvoiceReadiness(row);
    if (r.ready) out.push(row.job);
  }
  return out;
}
