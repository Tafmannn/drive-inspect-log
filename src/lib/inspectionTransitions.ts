/**
 * Pure status-transition rules for inspection submission.
 * Extracted from `submitInspection` in api.ts so the business rule
 * can be unit-tested without mocking Supabase.
 *
 * Rules (single source of truth — keep in sync with submitInspection):
 *   • pickup inspection submitted   → status = PICKUP_COMPLETE
 *   • delivery inspection submitted with prior pickup_inspection
 *       → status = POD_READY (awaiting POD review)
 *   • delivery inspection submitted WITHOUT prior pickup_inspection
 *       → status = DELIVERY_COMPLETE  (incomplete trail; admin to reconcile)
 *   • Resubmission against a job already in a terminal/POD-ready state
 *       must be rejected — caller raises an Error.
 */
import { JOB_STATUS, type JobStatusValue } from "./statusConfig";
import type { InspectionType } from "./types";

export const INSPECTION_RESUBMIT_BLOCKING_STATUSES: JobStatusValue[] = [
  JOB_STATUS.COMPLETED,
  JOB_STATUS.POD_READY,
  JOB_STATUS.DELIVERY_COMPLETE,
];

export function nextStatusForInspection(
  type: InspectionType,
  hasPickupInspection: boolean,
): JobStatusValue {
  if (type === "pickup") return JOB_STATUS.PICKUP_COMPLETE;
  return hasPickupInspection
    ? JOB_STATUS.POD_READY
    : JOB_STATUS.DELIVERY_COMPLETE;
}

export function shouldBlockResubmission(
  alreadyInspectedAt: string | null | undefined,
  currentStatus: string,
): boolean {
  if (!alreadyInspectedAt) return false;
  return (INSPECTION_RESUBMIT_BLOCKING_STATUSES as string[]).includes(
    currentStatus,
  );
}
