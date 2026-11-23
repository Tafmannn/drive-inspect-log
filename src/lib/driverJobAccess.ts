/**
 * Driver access to closed jobs.
 *
 * Once a job is completed (POD approved by an admin), cancelled, aborted or archived,
 * a driver may still see completed ones listed in "Last 14 Days" as a record,
 * but must not open the job, the POD, or any navigation/contact actions for
 * it. Admins are unaffected.
 *
 * Keep in sync with the database helpers driver_can_read_job_evidence() and
 * driver_can_use_job_path(), and with callerCanAccessPath() in
 * supabase/functions/_shared/auth.ts.
 */
import { JOB_STATUS } from "@/lib/statusConfig";

export const DRIVER_LOCKED_STATUSES: readonly string[] = [
  JOB_STATUS.COMPLETED,
  JOB_STATUS.CANCELLED,
  JOB_STATUS.ARCHIVED,
  JOB_STATUS.ABORTED,
];

export function isJobLockedForDriver(
  status: string | null | undefined,
  opts: { isAdmin: boolean; isSuperAdmin: boolean },
): boolean {
  if (opts.isAdmin || opts.isSuperAdmin) return false;
  return !!status && DRIVER_LOCKED_STATUSES.includes(status);
}

/** Heading for the locked screen: "Job completed", "Job aborted" or "Job closed". */
export function lockedJobHeading(status: string | null | undefined): string {
  if (status === JOB_STATUS.COMPLETED) return "Job completed";
  if (status === JOB_STATUS.ABORTED) return "Job aborted";
  return "Job closed";
}
