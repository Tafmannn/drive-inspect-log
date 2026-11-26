/**
 * Persistent admin acknowledgements for "Missing Evidence" queue items.
 *
 * Backed by the existing `attention_acknowledgements` table to avoid a
 * dedicated migration. Each persisted ack uses a stable, namespaced
 * exception_id of `evidence:<jobId>` so it cannot collide with other
 * exception sources (e.g. attention center).
 *
 * Why this exists:
 *   The Admin Jobs Queue's "Missing Evidence" bucket is derived purely
 *   from the boolean flags `has_pickup_inspection` / `has_delivery_inspection`.
 *   Until now, an admin had no way to remove a job from that queue
 *   without re-running an inspection — POD review had a clear path,
 *   missing-evidence did not. Persisted acks give admins an explicit
 *   "Mark resolved / dismiss from queue" action whose outcome survives
 *   reload AND is visible to other admins via RLS.
 *
 * Defense-in-depth: this is NOT an authorization gate. It only filters
 * the visibility of a job inside the missing-evidence bucket.
 */
import { supabase } from "@/integrations/supabase/client";

const EXCEPTION_PREFIX = "evidence:";

const exceptionId = (jobId: string) => `${EXCEPTION_PREFIX}${jobId}`;

/** Fetch the set of jobIds whose missing-evidence blocker has been dismissed. */
export async function listAcknowledgedEvidenceJobIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("attention_acknowledgements")
    .select("exception_id, job_id, snoozed_until")
    .like("exception_id", `${EXCEPTION_PREFIX}%`);

  if (error) throw error;

  const now = Date.now();
  const ids = new Set<string>();
  for (const row of data ?? []) {
    // snoozed_until = null  → permanent ack
    // snoozed_until > now   → still snoozed
    // snoozed_until <= now  → expired, treat as not acknowledged
    if (row.snoozed_until && new Date(row.snoozed_until).getTime() <= now) continue;
    if (row.job_id && row.exception_id === exceptionId(row.job_id)) ids.add(row.job_id);
  }
  return ids;
}

/** Persist a dismissal so this job stops appearing in the missing-evidence queue. */
export async function acknowledgeMissingEvidence(jobId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("acknowledge_attention_exception", {
    p_exception_id: exceptionId(jobId),
    p_job_id: jobId,
    p_note: note ?? "Missing evidence dismissed by admin",
  });
  if (error) throw error;
}

/** Reverse a previous dismissal — the job will reappear in the queue. */
export async function unacknowledgeMissingEvidence(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("attention_acknowledgements")
    .delete()
    .eq("exception_id", exceptionId(jobId))
    .eq("job_id", jobId);
  if (error) throw error;
}
