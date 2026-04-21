/**
 * Shared, pure selectors for jobs data.
 *
 * Both the mobile Admin Jobs Queue (grouped buckets) and the desktop Control
 * Jobs surface (flat filtered list) need the same primitives:
 *   • Resolve driver display name from FK-joined driver_profiles (with fallback).
 *   • Decide whether a job is unassigned / stale / needs evidence.
 *   • Group active jobs into operational buckets.
 *
 * Keeping the logic here ensures the two UIs always agree on what "stale" or
 * "unassigned" means — historically these definitions drifted between the two
 * surfaces, which caused KPI counts to disagree with queue contents.
 *
 * Pure functions only — no React, no Supabase. Easily unit-testable.
 */
import {
  ACTIVE_STATUSES,
  PENDING_STATUSES,
  TERMINAL_STATUSES,
} from "@/lib/statusConfig";

/** Stale threshold: an active job with no update for >24h is stale. */
export const STALE_HOURS = 24;
export const STALE_MS = STALE_HOURS * 60 * 60 * 1000;

/** Minimal row shape needed for the resolveDriverName selector. */
export interface DriverNameInput {
  driver_name?: string | null;
  driver_profiles?: {
    display_name?: string | null;
    full_name?: string | null;
  } | null;
}

/**
 * Resolve a driver display name from a Supabase row that joined driver_profiles.
 * Preference order: profile.display_name → profile.full_name → legacy driver_name.
 * Returns null when no name can be determined (treat as unassigned).
 */
export function resolveDriverName(row: DriverNameInput): string | null {
  const profile = row.driver_profiles;
  if (profile) {
    return profile.display_name || profile.full_name || row.driver_name || null;
  }
  return row.driver_name || null;
}

/** Minimal shape needed by the dispatch predicates below. */
export interface DispatchJob {
  status: string;
  updated_at: string;
  has_pickup_inspection?: boolean;
  has_delivery_inspection?: boolean;
  resolvedDriverName?: string | null;
}

export function isActive(status: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(status);
}
export function isPending(status: string): boolean {
  return (PENDING_STATUSES as string[]).includes(status);
}
export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as string[]).includes(status);
}

export function isJobStale(row: DispatchJob): boolean {
  if (!isActive(row.status)) return false;
  return Date.now() - new Date(row.updated_at).getTime() > STALE_MS;
}

export function isUnassigned(row: DispatchJob): boolean {
  return !row.resolvedDriverName;
}

export function isMissingEvidence(row: DispatchJob): boolean {
  return !row.has_pickup_inspection || !row.has_delivery_inspection;
}

/**
 * Group jobs into the operational buckets used by AdminJobsQueue.
 * Pure — accepts any row that satisfies DispatchJob.
 *
 * `evidenceWindowMs`: only flag missing evidence on jobs updated within this window.
 */
export function groupJobsByQueue<T extends DispatchJob>(
  rows: T[],
  evidenceWindowMs: number = 7 * 86400_000,
): {
  needsAttention: T[];
  unassigned: T[];
  inProgress: T[];
  review: T[];
  completed: T[];
  missingEvidence: T[];
} {
  const out = {
    needsAttention: [] as T[],
    unassigned: [] as T[],
    inProgress: [] as T[],
    review: [] as T[],
    completed: [] as T[],
    missingEvidence: [] as T[],
  };

  const evidenceCutoff = Date.now() - evidenceWindowMs;

  for (const row of rows) {
    const active = isActive(row.status) || row.status === "assigned";
    const pending = isPending(row.status);
    const terminal = isTerminal(row.status);
    const unassigned = isUnassigned(row);
    const stale = isJobStale(row);

    if (active && (stale || unassigned)) out.needsAttention.push(row);
    if (active && unassigned) out.unassigned.push(row);
    if (active && !unassigned) out.inProgress.push(row);
    if (pending) out.review.push(row);
    if (terminal) out.completed.push(row);
    if (
      (terminal || pending) &&
      isMissingEvidence(row) &&
      new Date(row.updated_at).getTime() > evidenceCutoff
    ) {
      out.missingEvidence.push(row);
    }
  }

  return out;
}

/** ISO timestamp for "anything older than this is stale". */
export function staleThresholdIso(): string {
  return new Date(Date.now() - STALE_MS).toISOString();
}
