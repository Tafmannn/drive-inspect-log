/**
 * Canonical photo normaliser/deduper.
 *
 * Why this exists
 * ───────────────
 * The POD report and admin galleries used to render `job.photos` directly.
 * In the wild we observed two failure modes:
 *
 *   1. Duplicate photo rows. A retry that succeeded after a flaky network
 *      attempt could produce two rows for the same captured image
 *      (different ids, identical url / backend_ref). The viewer would
 *      then render a second placeholder tile every time the image's
 *      onError handler fired — manifesting as the "282 preview boxes" bug.
 *
 *   2. Stale-run leakage. After an admin reopened a job, photos from the
 *      previous run could still appear alongside the new run's photos
 *      because the legacy column `run_id` was nullable and the client
 *      filter treated null as "show".
 *
 * This module is the single source of truth for: archived filtering,
 * current-run isolation (with a strict legacy fallback), and identity
 * deduplication.
 *
 * Pure functions only. No React, no Supabase. Trivially unit-testable.
 */
import type { Photo } from "./types";

/**
 * Identity key for a photo. Strongest available identifier wins so that
 * two rows pointing at the same physical asset collapse to one entry
 * regardless of which write path produced them.
 *
 *   1. id           — primary key. Always wins when present.
 *   2. backend_ref  — storage backend ref (GCS object name etc).
 *   3. inspection_id + type + url — best effort for legacy rows that
 *                                   lack a backend_ref.
 *   4. url          — last-resort fallback.
 */
export function photoIdentity(p: Photo): string {
  if (p.id) return `id:${p.id}`;
  if (p.backend_ref) return `ref:${p.backend_ref}`;
  if (p.inspection_id && p.url) {
    return `insp:${p.inspection_id}|${p.type}|${p.url}`;
  }
  return `url:${p.url}`;
}

/**
 * Drop archived photos. Defensive — the server-side queries in
 * getJobWithRelations already filter `archived_at IS NULL`, but cached
 * payloads or admin tools that bypass that filter must not be allowed
 * to pollute the POD.
 */
export function excludeArchived(photos: Photo[]): Photo[] {
  return photos.filter((p) => !p.archived_at);
}

/**
 * Apply current-run isolation.
 *
 * Behaviour (per product decision):
 *   • If `currentRunId` is null/undefined we cannot isolate — return as-is.
 *   • Otherwise, prefer photos whose `run_id === currentRunId`.
 *   • Legacy photos with `run_id == null` are included ONLY when there
 *     are zero photos matching `currentRunId`. This keeps PODs for old
 *     pre-run_id jobs renderable while preventing null-run photos from
 *     flooding a reopened job's POD.
 *   • Photos belonging to a *different* run are always excluded.
 */
export function isolateToCurrentRun(
  photos: Photo[],
  currentRunId: string | null | undefined,
): Photo[] {
  if (!currentRunId) return photos;

  const currentRun: Photo[] = [];
  const legacyNullRun: Photo[] = [];
  for (const p of photos) {
    const rid = p.run_id ?? null;
    if (rid === currentRunId) currentRun.push(p);
    else if (rid === null) legacyNullRun.push(p);
    // else: belongs to a different run — drop.
  }

  if (currentRun.length > 0) return currentRun;
  return legacyNullRun;
}

/**
 * Deduplicate by identity. The first occurrence wins, which preserves
 * the order callers expect (typically chronological from the API).
 */
export function dedupeByIdentity(photos: Photo[]): Photo[] {
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const p of photos) {
    const key = photoIdentity(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Canonicalise a photo list for display: drop archived, isolate to the
 * job's current run (with the documented legacy fallback), then dedupe.
 *
 * This is the function POD/photo viewers should call. Anything else is
 * a bug.
 */
export function canonicalisePhotos(
  photos: Photo[] | null | undefined,
  currentRunId: string | null | undefined,
): Photo[] {
  if (!photos || photos.length === 0) return [];
  return dedupeByIdentity(
    isolateToCurrentRun(excludeArchived(photos), currentRunId),
  );
}
