/**
 * Rules for the super-admin status override.
 *
 * The database function `super_admin_override_job_status` is the authority: it
 * refuses non-super-admins, a missing reason, an unknown status and a job that is
 * on a live invoice. This file holds the same rules so the form can say so before
 * the user submits, and so the warnings shown beside each choice live in one tested
 * place. Keep MIN_REASON_LENGTH and the status list in sync with the migration
 * (src/test/job-status-override.test.ts checks both).
 */
import { JOB_STATUS, type JobStatusValue } from "@/lib/statusConfig";

export const MIN_REASON_LENGTH = 5;

/** Every status a super admin may set (the whole JOB_STATUS set). */
export const OVERRIDE_STATUSES: JobStatusValue[] = Object.values(JOB_STATUS);

/** "ready_for_pickup" -> "Ready For Pickup" (the precise name, unlike the coarse badge labels). */
export function overrideStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The statuses offered in the picker: everything except where the job already is. */
export function overrideTargets(current: string): JobStatusValue[] {
  return OVERRIDE_STATUSES.filter((s) => s !== current);
}

export function reasonProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return "Enter a reason. It is recorded with the change.";
  if (trimmed.length < MIN_REASON_LENGTH) return `The reason must be at least ${MIN_REASON_LENGTH} characters.`;
  return null;
}

/** Statuses that make the job look finished to the rest of the app. */
const DONE_STATUSES = new Set<string>([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.DELIVERY_COMPLETE,
  JOB_STATUS.POD_READY,
]);

/** Statuses that look like the vehicle has been collected / is on the road. */
const ON_THE_ROAD_STATUSES = new Set<string>([
  JOB_STATUS.PICKUP_COMPLETE,
  JOB_STATUS.IN_TRANSIT,
  JOB_STATUS.DELIVERY_IN_PROGRESS,
]);

/**
 * Plain-English consequences of moving from one status to another, shown under the
 * picker. Always at least one line, so the user never confirms blind.
 */
export function overrideWarnings(from: string, to: string): string[] {
  const out: string[] = [];

  if (from === JOB_STATUS.COMPLETED && to !== JOB_STATUS.COMPLETED) {
    out.push("The completion date is cleared (the old one is kept in the audit record). The job leaves Ready to invoice and completed reports.");
  }
  if (to === JOB_STATUS.COMPLETED) {
    out.push("The job counts as completed from now. It will appear in Ready to invoice if it has a price and a client.");
  }
  if (to === JOB_STATUS.CANCELLED || to === JOB_STATUS.ARCHIVED || to === JOB_STATUS.FAILED) {
    out.push("Drivers lose access to the job, and it drops out of live and billing lists.");
  }
  if (DONE_STATUSES.has(to) || ON_THE_ROAD_STATUSES.has(to)) {
    out.push("No collected / delivered email is sent to the customer. This is a manual correction.");
  }
  if (out.length === 0) {
    out.push("Only the status changes. Inspections, photos and prices are left as they are.");
  }
  return out;
}

/** Turns the database's error codes into a sentence a person can act on. */
export function overrideErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const text = `${error?.message ?? ""}`;
  if (text.includes("SUPER_ADMIN_ONLY")) return "Only a super admin can override a job's status.";
  if (text.includes("REASON_REQUIRED")) return `Enter a reason of at least ${MIN_REASON_LENGTH} characters.`;
  if (text.includes("INVALID_STATUS")) return "That is not a valid job status.";
  if (text.includes("JOB_NOT_FOUND")) return "This job could not be found.";
  if (text.includes("JOB_ALREADY_IN_STATUS")) return "The job is already in that status.";
  if (text.includes("JOB_ON_LIVE_INVOICE")) {
    return "This job is on an invoice. Cancel the invoice first, then change the status.";
  }
  return text || "The status could not be changed. Please try again.";
}
