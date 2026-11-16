/**
 * Driver access to finished jobs.
 *
 * Once a job is completed (POD approved by an admin), a driver may still see
 * it listed in "Last 14 Days" as a record, but must not open the job, the
 * POD, or any navigation/contact actions for it. Admins are unaffected.
 */
import { JOB_STATUS } from "@/lib/statusConfig";

export function isJobLockedForDriver(
  status: string | null | undefined,
  opts: { isAdmin: boolean; isSuperAdmin: boolean },
): boolean {
  if (opts.isAdmin || opts.isSuperAdmin) return false;
  return status === JOB_STATUS.COMPLETED;
}
