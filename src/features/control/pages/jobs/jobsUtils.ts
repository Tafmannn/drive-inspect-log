/**
 * Jobs dispatch utilities — thin re-exports of the shared selectors.
 *
 * Kept as a separate module for backwards compatibility with existing call
 * sites (AdminDashboard, AdminJobsQueue, etc). New code should import directly
 * from `@/features/jobs/selectors`.
 */
import { PENDING_STATUSES, TERMINAL_STATUSES, ACTIVE_STATUSES } from "@/lib/statusConfig";
import {
  isJobStale as _isJobStale,
  isUnassigned as _isUnassigned,
  type DispatchJob,
} from "@/features/jobs/selectors";

export type DispatchRow = DispatchJob;

export const isJobStale = _isJobStale;
export const isUnassigned = _isUnassigned;

export function canReviewPod(row: DispatchRow): boolean {
  return (PENDING_STATUSES as string[]).includes(row.status);
}

export function canInspect(row: DispatchRow): boolean {
  if (!(ACTIVE_STATUSES as string[]).includes(row.status)) return false;
  return !row.has_pickup_inspection || !row.has_delivery_inspection;
}

export function canAddExpense(row: DispatchRow): boolean {
  return !(TERMINAL_STATUSES as string[]).includes(row.status);
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
