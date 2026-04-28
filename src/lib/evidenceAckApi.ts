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
    if (row.job_id) {
      ids.add(row.job_id);
    } else if (typeof row.exception_id === "string" && row.exception_id.startsWith(EXCEPTION_PREFIX)) {
      ids.add(row.exception_id.slice(EXCEPTION_PREFIX.length));
    }
  }
  return ids;
}

/** Persist a dismissal so this job stops appearing in the missing-evidence queue. */
export async function acknowledgeMissingEvidence(jobId: string, note?: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const acknowledged_by = auth.user?.id;
  if (!acknowledged_by) throw new Error("Not authenticated");

  // Best-effort dedupe: remove any prior ack for this job/exception pair so
  // we never accumulate stale rows. The unique key is logical (job, exception).
  await supabase
    .from("attention_acknowledgements")
    .delete()
    .eq("exception_id", exceptionId(jobId));

  const { error } = await supabase
    .from("attention_acknowledgements")
    .insert({
      exception_id: exceptionId(jobId),
      job_id: jobId,
      acknowledged_by,
      note: note ?? "Missing evidence dismissed by admin",
    });

  if (error) throw error;
}

/** Reverse a previous dismissal — the job will reappear in the queue. */
export async function unacknowledgeMissingEvidence(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("attention_acknowledgements")
    .delete()
    .eq("exception_id", exceptionId(jobId));
  if (error) throw error;
}
