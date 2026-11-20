/**
 * Super-admin status override: the one call to the database function.
 * The function does the real checking (see supabase/migrations/20261120100000_*).
 */
import { supabase } from "@/integrations/supabase/client";
import { overrideErrorMessage, reasonProblem } from "@/lib/jobStatusOverride";

type RpcCall = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export interface StatusOverrideResult {
  fromStatus: string;
  toStatus: string;
  /** Customer notifications the status change queued and the function removed. */
  removedNotifications: number;
}

export async function superAdminOverrideStatus(
  jobId: string,
  newStatus: string,
  reason: string,
): Promise<StatusOverrideResult> {
  const problem = reasonProblem(reason);
  if (problem) throw new Error(problem);

  // The generated types do not know this function yet (the same cast reopen_job uses).
  const rpc = (supabase as unknown as { rpc: RpcCall }).rpc.bind(supabase);
  const { data, error } = await rpc("super_admin_override_job_status", {
    p_job_id: jobId,
    p_new_status: newStatus,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(overrideErrorMessage(error));

  const row = (data ?? {}) as Partial<StatusOverrideResult>;
  return {
    fromStatus: row.fromStatus ?? "",
    toStatus: row.toStatus ?? newStatus,
    removedNotifications: row.removedNotifications ?? 0,
  };
}
