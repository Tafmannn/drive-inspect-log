/**
 * Jobs dispatch utilities — local to the Jobs control page.
 * Kept here because only the Jobs surface needs these rules right now.
 */
import { ACTIVE_STATUSES, PENDING_STATUSES, TERMINAL_STATUSES } from "@/lib/statusConfig";
import type { JobControlRow } from "../../hooks/useControlJobsData";

// ─── Stale threshold ─────────────────────────────────────────────────
/** An active job with no update for >24 h is considered stale. */
const STALE_HOURS = 24;

export function isJobStale(row: JobControlRow): boolean {
  if (!ACTIVE_STATUSES.includes(row.status as any)) return false;
  const ms = Date.now() - new Date(row.updated_at).getTime();
  return ms > STALE_HOURS * 60 * 60 * 1000;
}

// ─── Action eligibility ──────────────────────────────────────────────

export function canReviewPod(row: JobControlRow): boolean {
  return PENDING_STATUSES.includes(row.status as any);
}

export function canInspect(row: JobControlRow): boolean {
  // Only active jobs where pickup or delivery inspection is still missing
  if (!ACTIVE_STATUSES.includes(row.status as any)) return false;
  return !row.has_pickup_inspection || !row.has_delivery_inspection;
}

export function canAddExpense(row: JobControlRow): boolean {
  return !TERMINAL_STATUSES.includes(row.status as any);
}

export function isUnassigned(row: JobControlRow): boolean {
  return !row.resolvedDriverName;
}

// ─── Human-readable age ──────────────────────────────────────────────
export function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
