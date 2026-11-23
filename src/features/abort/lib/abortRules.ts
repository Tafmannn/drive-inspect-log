/**
 * Abort workflow — pure rules shared by the driver request button, the admin Abort dialog,
 * the Aborts queue and invoicing. No I/O; every rule is unit-tested
 * (src/test/abort-rules.test.ts).
 *
 * The database is the authority (supabase/migrations/20261123100000_job_abort_workflow.sql):
 * confirm_job_abort() re-checks eligibility, the name, the organisation and the role, and
 * writes the authoritative "Abort confirmed at" timestamp. These rules exist so the UI only
 * offers what the server will accept and can explain a refusal in plain English.
 */
import { JOB_STATUS } from "@/lib/statusConfig";

/** Keep in sync with abort_eligible_statuses() in the migration. */
export const ABORT_ELIGIBLE_STATUSES: readonly string[] = [
  JOB_STATUS.NEW,
  JOB_STATUS.PENDING,
  JOB_STATUS.READY_FOR_PICKUP,
  JOB_STATUS.ASSIGNED,
  JOB_STATUS.PICKUP_IN_PROGRESS,
];

export const CONTACT_NAME_MAX = 120;

export type AbortFinanceStatus = "pending_review" | "approved" | "rejected";
export type AbortRequestStatus = "pending" | "confirmed" | "dismissed" | "superseded";

/** A finance decision locks ordinary review as soon as it is made.
 * Invoicing is an additional lock, not the trigger for the first one. */
export function isAbortFeeReviewLocked(status: AbortFinanceStatus, invoiced: boolean): boolean {
  return invoiced || status !== "pending_review";
}

export interface AbortEligibilityJob {
  status: string | null | undefined;
  has_pickup_inspection?: boolean | null;
  is_hidden?: boolean | null;
}

/** Pre-collection only: once the pickup inspection is in, delivery / exception workflows apply. */
export function isAbortEligible(job: AbortEligibilityJob | null | undefined): boolean {
  if (!job?.status) return false;
  if (job.is_hidden) return false;
  if (job.has_pickup_inspection) return false;
  return ABORT_ELIGIBLE_STATUSES.includes(job.status);
}

/** The driver may ask only for their own, eligible, assigned job. */
export function canDriverRequestAbort(
  job: (AbortEligibilityJob & { driver_id?: string | null }) | null | undefined,
  myDriverProfileId: string | null | undefined,
): boolean {
  if (!job || !myDriverProfileId) return false;
  return job.driver_id === myDriverProfileId && isAbortEligible(job);
}

/** Collapse runs of whitespace; "" when nothing is left. */
export function normaliseContactName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export interface AbortFormInput {
  contactName: string;
  noNameException: boolean;
}

/** Null when the form can be submitted, otherwise the message to show under the field. */
export function abortFormProblem(input: AbortFormInput): string | null {
  const name = normaliseContactName(input.contactName);
  if (name.length > CONTACT_NAME_MAX) return `Keep the name under ${CONTACT_NAME_MAX} characters.`;
  if (!name && !input.noNameException) {
    return "Enter the name of the person confirming the Abort, or authorise without a name.";
  }
  return null;
}

/** What is sent to confirm_job_abort: a typed name always wins over the exception. */
export function abortConfirmPayload(input: AbortFormInput): { contactName: string | null; noNameException: boolean } {
  const name = normaliseContactName(input.contactName);
  return name ? { contactName: name, noNameException: false } : { contactName: null, noNameException: input.noNameException };
}

const UK_DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

/**
 * "Abort confirmed at" in UK time (GMT in winter, BST in summer), e.g. "23 Nov 2026, 14:05 GMT".
 * The value is the server's timestamptz; the device clock is never used.
 */
export function formatAbortConfirmedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return UK_DATE_TIME.format(d);
}

export interface AbortRecordLike {
  finance_status: AbortFinanceStatus;
  approved_amount: number | null;
  reopened_at?: string | null;
}

/** Where an Abort sits in the admin queue. Invoiced / paid come from the invoices themselves. */
export type AbortQueueStage =
  | "awaiting_review"
  | "ready_to_invoice"
  | "invoiced"
  | "paid"
  | "rejected"
  | "approved_nil"
  | "reopened";

export function abortQueueStage(
  abort: AbortRecordLike,
  invoice: { invoiced: boolean; paid: boolean } = { invoiced: false, paid: false },
): AbortQueueStage {
  if (abort.reopened_at) return "reopened";
  if (invoice.paid) return "paid";
  if (invoice.invoiced) return "invoiced";
  if (abort.finance_status === "rejected") return "rejected";
  if (abort.finance_status === "approved") {
    return Number(abort.approved_amount ?? 0) > 0 ? "ready_to_invoice" : "approved_nil";
  }
  return "awaiting_review";
}

export const ABORT_STAGE_LABEL: Record<AbortQueueStage, string> = {
  awaiting_review: "Fee to review",
  ready_to_invoice: "Ready to invoice",
  invoiced: "Invoiced",
  paid: "Paid",
  rejected: "Fee rejected",
  approved_nil: "Approved — nil fee",
  reopened: "Reopened",
};

export const FINANCE_STATUS_LABEL: Record<AbortFinanceStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

/** "Abort at Collection — JOB-1042 — AB12 CDE" */
export function abortInvoiceDescription(job: {
  id: string;
  external_job_number?: string | null;
  vehicle_reg?: string | null;
}): string {
  const ref = job.external_job_number?.trim() || job.id.slice(0, 8).toUpperCase();
  const reg = (job.vehicle_reg ?? "").trim().toUpperCase();
  return ["Abort at Collection", ref, reg].filter(Boolean).join(" — ");
}

/**
 * Validates an approval amount typed by an admin. Null when fine.
 * Unknown agreed price: any non-negative amount; known: up to the agreed price.
 */
export function approvalAmountProblem(raw: string, agreedPrice: number | null): string | null {
  const t = raw.trim();
  if (!t) return agreedPrice == null ? "Enter the amount to approve — the agreed price is not known." : null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "Enter an amount in pounds, e.g. 120 or 120.50.";
  const n = Number(t);
  if (agreedPrice != null && n > agreedPrice) return `Cannot exceed the agreed price of £${agreedPrice.toFixed(2)}.`;
  return null;
}

/** Plain-English messages for the database's error codes. */
export function abortErrorMessage(error: unknown): string {
  const text = String((error as { message?: string })?.message ?? error ?? "");
  const map: [string, string][] = [
    ["CONTACT_NAME_REQUIRED", "Enter the name of the person confirming the Abort, or authorise without a name."],
    ["CONTACT_NAME_TOO_LONG", `Keep the name under ${CONTACT_NAME_MAX} characters.`],
    ["STALE_JOB_STATE", "This job has changed since you opened it. Check the latest status, then try again."],
    ["ABORT_NOT_ELIGIBLE", "Only a job that has not been collected can be aborted."],
    ["JOB_ALREADY_ABORTED", "This job has already been aborted."],
    ["ABORT_REQUEST_DENIED", "Only the driver assigned to this job can request an Abort."],
    ["ADMIN_OR_SUPER_ADMIN_ONLY", "Only an admin can do this."],
    ["ABORT_CLAIM_ALREADY_REVIEWED", "This fee has already been approved or rejected and is locked. A Super Admin must use an exceptional amendment."],
    ["SUPER_ADMIN_ONLY", "Only a Super Admin can amend an approved Abort fee."],
    ["AMENDMENT_REASON_REQUIRED", "Enter a reason of at least 15 characters for the exceptional amendment."],
    ["ABORT_FEE_NOT_APPROVED", "Only an approved Abort fee can be amended."],
    ["ABORT_FEE_CHANGED", "The fee changed since you opened it. Refresh and review the latest amount."],
    ["ABORT_AMENDMENT_NO_CHANGE", "Enter an amount different from the approved fee."],
    ["ABORT_CLAIM_INVOICED", "This Abort fee is on an invoice. Cancel the invoice before changing it."],
    ["ABORT_INVOICED", "This Abort has been invoiced. Create a linked replacement job instead of reopening."],
    ["ABORT_REOPENED", "The job was reopened, so this Abort can no longer be claimed."],
    ["AMOUNT_ABOVE_AGREED_PRICE", "The approved amount cannot exceed the agreed price."],
    ["AMOUNT_REQUIRED", "Enter the amount to approve — the agreed price is not known."],
    ["NO_LINKED_CLIENT", "Link the job to a client before notifying them."],
    ["ABORT_NOT_CURRENT", "This job is no longer aborted."],
    ["ABORT_NOT_APPROVED", "This Abort fee has not been approved, so it cannot be invoiced."],
    ["ABORT_AMOUNT_EXCEEDED", "The invoice line is above the approved Abort fee."],
    ["ABORT_STATUS_PROTECTED", "Aborted is managed by the Abort workflow. Use Abort Job, or reopen the job."],
    ["JOB_NOT_FOUND", "This job could not be found."],
    ["ABORT_NOT_FOUND", "This Abort could not be found."],
    ["REQUEST_NOT_FOUND", "This request could not be found."],
  ];
  for (const [code, msg] of map) if (text.includes(code)) return msg;
  if (/Failed to fetch|NetworkError|network/i.test(text)) {
    return "No connection. Nothing was saved — try again when you have signal.";
  }
  return text || "Something went wrong. Nothing was saved.";
}
