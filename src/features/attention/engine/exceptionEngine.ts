/**
 * Attention Center – Exception derivation engine.
 * Derives exception records from raw DB rows. Pure logic, no fetching.
 */

import { ATTENTION_THRESHOLDS as T } from "../config/thresholds";
import type { AttentionException, ExceptionSeverity } from "../types/exceptionTypes";
import type { Tables } from "@/integrations/supabase/types";

/** Use the DB row type which includes org_id and all status values */
type JobRow = Tables<"jobs">;

/* ── helpers ────────────────────────────────────────────────────── */

let _counter = 0;

/** Collision-resistant unique ID. Deterministic prefix for debuggability. */
function uniqueExcId(category: string, jobId?: string): string {
  _counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${category}-${jobId?.slice(0, 8) ?? "global"}-${_counter}-${rand}`;
}

function minutesAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function exc(
  partial: Omit<AttentionException, "id">,
): AttentionException {
  return { ...partial, id: uniqueExcId(partial.category, partial.jobId) };
}

/* ── Timing exceptions ─────────────────────────────────────────── */

export function deriveTimingExceptions(
  jobs: JobRow[],
  orgLookup?: Map<string, string>,
): AttentionException[] {
  const out: AttentionException[] = [];

  for (const j of jobs) {
    const orgName = orgLookup?.get(j.org_id) ?? undefined;
    const base = { jobId: j.id, jobNumber: j.external_job_number ?? j.id.slice(0, 8), orgId: j.org_id, orgName };

    // Issue #7: No dedicated pickup_started_at / delivery_started_at / pod_ready_at
    // columns exist in the schema. Fallback to updated_at is the only option.
    const ts = j.updated_at;

    if (
      (j.status === "ready_for_pickup" || j.status === "assigned") &&
      minutesAgo(ts) > T.readyForPickupNoStartMinutes
    ) {
      out.push(exc({
        ...base, severity: "high", category: "timing",
        title: "No pickup started",
        detail: `${Math.round(minutesAgo(ts))}m since ready — threshold ${T.readyForPickupNoStartMinutes}m`,
        createdAt: ts,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }

    if (j.status === "pickup_in_progress" && minutesAgo(ts) > T.pickupInProgressMinutes) {
      out.push(exc({
        ...base, severity: "high", category: "timing",
        title: "Pickup taking too long",
        detail: `${Math.round(minutesAgo(ts))}m in pickup — threshold ${T.pickupInProgressMinutes}m`,
        createdAt: ts,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }

    if (j.status === "delivery_in_progress" && minutesAgo(ts) > T.deliveryInProgressMinutes) {
      out.push(exc({
        ...base, severity: "high", category: "timing",
        title: "Delivery taking too long",
        detail: `${Math.round(minutesAgo(ts))}m in delivery — threshold ${T.deliveryInProgressMinutes}m`,
        createdAt: ts,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }

    if (j.status === "pod_ready" && minutesAgo(ts) > T.podReadyDelayMinutes) {
      out.push(exc({
        ...base, severity: "medium", category: "timing",
        title: "POD generation delayed",
        detail: `${Math.round(minutesAgo(ts))}m since POD_READY — threshold ${T.podReadyDelayMinutes}m`,
        createdAt: ts,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }
  }
  return out;
}

/* ── Evidence exceptions ───────────────────────────────────────── */

interface InspectionRow {
  id: string;
  job_id: string;
  org_id: string;
  driver_signature_url: string | null;
  customer_signature_url: string | null;
}

export function deriveEvidenceExceptions(
  completedJobs: JobRow[],
  inspections: InspectionRow[],
  logEntries: { event: string; job_id: string | null; created_at: string; context: any }[],
  orgLookup?: Map<string, string>,
): AttentionException[] {
  const out: AttentionException[] = [];
  const inspByJob = new Map<string, InspectionRow[]>();
  for (const i of inspections) {
    const arr = inspByJob.get(i.job_id) ?? [];
    arr.push(i);
    inspByJob.set(i.job_id, arr);
  }

  for (const j of completedJobs) {
    const orgName = orgLookup?.get(j.org_id) ?? undefined;
    const base = { jobId: j.id, jobNumber: j.external_job_number ?? j.id.slice(0, 8), orgId: j.org_id, orgName };
    const insps = inspByJob.get(j.id) ?? [];

    // Skip jobs with no inspections at all
    if (insps.length === 0) continue;

    // Issue #2: Only raise when ALL inspections for the job lack the signature.
    // Previously used .some() which caused false positives when only one of
    // multiple inspections was unsigned.
    const allMissingDriver = insps.every(i => !i.driver_signature_url);
    const allMissingCustomer = insps.every(i => !i.customer_signature_url);

    if (allMissingDriver) {
      out.push(exc({
        ...base, severity: "high", category: "evidence",
        title: "Missing driver signature",
        detail: `All ${insps.length} inspection(s) lack driver signature`,
        createdAt: j.completed_at ?? j.updated_at,
        actionLabel: "Review inspection", actionRoute: `/jobs/${j.id}`,
      }));
    }
    if (allMissingCustomer) {
      out.push(exc({
        ...base, severity: "medium", category: "evidence",
        title: "Missing customer signature",
        detail: `All ${insps.length} inspection(s) lack customer signature`,
        createdAt: j.completed_at ?? j.updated_at,
        actionLabel: "Review inspection", actionRoute: `/jobs/${j.id}`,
      }));
    }
  }

  // Signature resolution failures
  const sigFailures = logEntries.filter(l => l.event === "signature_resolve_failed");
  for (const l of sigFailures) {
    out.push(exc({
      jobId: l.job_id ?? undefined,
      jobNumber: l.job_id?.slice(0, 8),
      orgId: l.context?.org_id,
      severity: "high", category: "evidence",
      title: "Signature resolution failed",
      detail: l.context?.originalUrl?.slice(0, 80) ?? "Could not resolve signature URL",
      createdAt: l.created_at,
      actionLabel: "Open logs", actionRoute: "/admin/logs",
    }));
  }

  // Issue #3: Restrict upload failures to last 24h only.
  // logEntries are already filtered to 24h in the data hook, but we enforce
  // the cutoff here too for engine-level correctness regardless of caller.
  const cutoff24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const uploadFailures = logEntries.filter(l =>
    (l.event === "photo_upload_failed" || l.event === "upload_failed") &&
    l.created_at >= cutoff24h
  );
  const failsByJob = new Map<string, { count: number; latestAt: string }>();
  for (const l of uploadFailures) {
    if (l.job_id) {
      const prev = failsByJob.get(l.job_id);
      failsByJob.set(l.job_id, {
        count: (prev?.count ?? 0) + 1,
        latestAt: prev && prev.latestAt > l.created_at ? prev.latestAt : l.created_at,
      });
    }
  }
  for (const [jobId, { count, latestAt }] of failsByJob) {
    if (count >= T.repeatedUploadFailuresCount) {
      out.push(exc({
        jobId,
        jobNumber: jobId.slice(0, 8),
        severity: "high", category: "evidence",
        title: "Repeated upload failures",
        detail: `${count} upload failures in last 24h`,
        createdAt: latestAt,
        actionLabel: "View job", actionRoute: `/jobs/${jobId}`,
      }));
    }
  }

  return out;
}

/* ── Sync exceptions ───────────────────────────────────────────── */

interface SyncErrorRow {
  id: string;
  sheet_row_index: number;
  missing_fields: string[];
  error_message: string | null;
  resolved: boolean;
  created_at: string;
}

export function deriveSyncExceptions(
  syncErrors: SyncErrorRow[],
  logEntries: { event: string; created_at: string; context: any }[],
): AttentionException[] {
  const out: AttentionException[] = [];

  for (const se of syncErrors) {
    if (se.resolved) continue;

    // Issue #4: Graduated severity based on error content
    let severity: ExceptionSeverity;
    if (se.error_message) {
      severity = "high";
    } else if (se.missing_fields && se.missing_fields.length > 0) {
      severity = "medium";
    } else {
      severity = "low";
    }

    out.push(exc({
      severity, category: "sync",
      title: `Sync error row ${se.sheet_row_index}`,
      detail: se.error_message ?? `Missing: ${se.missing_fields.join(", ")}`,
      createdAt: se.created_at,
      actionLabel: "Open sync errors", actionRoute: "/admin/sync-errors",
    }));
  }

  // Issue #4: duplicate_job_skipped is always low severity
  const dupes = logEntries.filter(l => l.event === "duplicate_job_skipped");
  for (const l of dupes) {
    out.push(exc({
      severity: "low", category: "sync",
      title: "Duplicate row skipped",
      detail: JSON.stringify(l.context ?? {}).slice(0, 100),
      createdAt: l.created_at,
      actionLabel: "Open logs", actionRoute: "/super-admin",
    }));
  }

  return out;
}

/* ── State exceptions ──────────────────────────────────────────── */

export function deriveStateExceptions(
  logEntries: { event: string; job_id: string | null; created_at: string; context: any }[],
): AttentionException[] {
  const out: AttentionException[] = [];

  const blockedTransitions = logEntries.filter(l => l.event === "blocked_status_transition");
  for (const l of blockedTransitions) {
    // Issue #5: Use /admin/logs instead of generic /admin when no job_id
    const fallbackRoute = "/admin/logs";
    out.push(exc({
      jobId: l.job_id ?? undefined,
      jobNumber: l.job_id?.slice(0, 8),
      severity: "high", category: "state",
      title: "Blocked status transition",
      detail: `Attempted: ${l.context?.from ?? "?"} → ${l.context?.to ?? "?"}`,
      createdAt: l.created_at,
      actionLabel: "View job", actionRoute: l.job_id ? `/jobs/${l.job_id}` : fallbackRoute,
    }));
  }

  const blockedResubmit = logEntries.filter(l => l.event === "blocked_inspection_resubmit");
  for (const l of blockedResubmit) {
    const fallbackRoute = "/admin/logs";
    out.push(exc({
      jobId: l.job_id ?? undefined,
      jobNumber: l.job_id?.slice(0, 8),
      severity: "medium", category: "state",
      title: "Blocked inspection resubmission",
      detail: l.context?.reason ?? "Inspection already submitted",
      createdAt: l.created_at,
      actionLabel: "View job", actionRoute: l.job_id ? `/jobs/${l.job_id}` : fallbackRoute,
    }));
  }

  return out;
}

/* ── Severity sort ─────────────────────────────────────────────── */

const SEV_ORDER: Record<ExceptionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortExceptions(exceptions: AttentionException[]): AttentionException[] {
  return [...exceptions].sort((a, b) =>
    SEV_ORDER[a.severity] - SEV_ORDER[b.severity] ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
    a.category.localeCompare(b.category) ||
    (a.jobId ?? "").localeCompare(b.jobId ?? "") ||
    a.title.localeCompare(b.title)
  );
}
