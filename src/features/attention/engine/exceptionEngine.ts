/**
 * Attention Center – Exception derivation engine.
 * Derives exception records from raw DB rows. Pure logic, no fetching.
 */

import { ATTENTION_THRESHOLDS as T } from "../config/thresholds";
import type { AttentionException, ExceptionSeverity } from "../types/exceptionTypes";
import type { Job } from "@/lib/types";

/* ── helpers ────────────────────────────────────────────────────── */

function minutesAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function exc(
  partial: Omit<AttentionException, "id">,
): AttentionException {
  return { ...partial, id: `${partial.category}-${partial.jobId ?? ""}-${partial.title}` };
}

/* ── Timing exceptions ─────────────────────────────────────────── */

export function deriveTimingExceptions(
  jobs: Job[],
  orgLookup?: Map<string, string>,
): AttentionException[] {
  const out: AttentionException[] = [];

  for (const j of jobs) {
    const orgName = orgLookup?.get(j.org_id) ?? undefined;
    const base = { jobId: j.id, jobNumber: j.external_job_number ?? j.id.slice(0, 8), orgId: j.org_id, orgName };

    if (
      (j.status === "ready_for_pickup" || j.status === "assigned") &&
      minutesAgo(j.updated_at) > T.readyForPickupNoStartMinutes
    ) {
      out.push(exc({
        ...base, severity: "high", category: "timing",
        title: "No pickup started",
        detail: `${Math.round(minutesAgo(j.updated_at))}m since ready — threshold ${T.readyForPickupNoStartMinutes}m`,
        createdAt: j.updated_at,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }

    if (j.status === "pickup_in_progress" && minutesAgo(j.updated_at) > T.pickupInProgressMinutes) {
      out.push(exc({
        ...base, severity: "high", category: "timing",
        title: "Pickup taking too long",
        detail: `${Math.round(minutesAgo(j.updated_at))}m in pickup — threshold ${T.pickupInProgressMinutes}m`,
        createdAt: j.updated_at,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }

    if (j.status === "delivery_in_progress" && minutesAgo(j.updated_at) > T.deliveryInProgressMinutes) {
      out.push(exc({
        ...base, severity: "high", category: "timing",
        title: "Delivery taking too long",
        detail: `${Math.round(minutesAgo(j.updated_at))}m in delivery — threshold ${T.deliveryInProgressMinutes}m`,
        createdAt: j.updated_at,
        actionLabel: "View job", actionRoute: `/jobs/${j.id}`,
      }));
    }

    if (j.status === "pod_ready" && minutesAgo(j.updated_at) > T.podReadyDelayMinutes) {
      out.push(exc({
        ...base, severity: "medium", category: "timing",
        title: "POD generation delayed",
        detail: `${Math.round(minutesAgo(j.updated_at))}m since POD_READY — threshold ${T.podReadyDelayMinutes}m`,
        createdAt: j.updated_at,
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
  completedJobs: Job[],
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

    const missingDriver = insps.some(i => !i.driver_signature_url);
    const missingCustomer = insps.some(i => !i.customer_signature_url);

    if (missingDriver) {
      out.push(exc({
        ...base, severity: "high", category: "evidence",
        title: "Missing driver signature",
        detail: "Completed job has inspection without driver signature",
        createdAt: j.completed_at ?? j.updated_at,
        actionLabel: "Review inspection", actionRoute: `/jobs/${j.id}`,
      }));
    }
    if (missingCustomer) {
      out.push(exc({
        ...base, severity: "medium", category: "evidence",
        title: "Missing customer signature",
        detail: "Completed job has inspection without customer signature",
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
      actionLabel: "Open logs", actionRoute: "/admin",
    }));
  }

  // Repeated upload failures
  const uploadFailures = logEntries.filter(l =>
    l.event === "photo_upload_failed" || l.event === "upload_failed"
  );
  const failsByJob = new Map<string, number>();
  for (const l of uploadFailures) {
    if (l.job_id) failsByJob.set(l.job_id, (failsByJob.get(l.job_id) ?? 0) + 1);
  }
  for (const [jobId, count] of failsByJob) {
    if (count >= T.repeatedUploadFailuresCount) {
      out.push(exc({
        jobId,
        jobNumber: jobId.slice(0, 8),
        severity: "high", category: "evidence",
        title: "Repeated upload failures",
        detail: `${count} upload failures for this job`,
        createdAt: new Date().toISOString(),
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
    out.push(exc({
      severity: "medium", category: "sync",
      title: `Sync error row ${se.sheet_row_index}`,
      detail: se.error_message ?? `Missing: ${se.missing_fields.join(", ")}`,
      createdAt: se.created_at,
      actionLabel: "Open sync errors", actionRoute: "/admin/sync-errors",
    }));
  }

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
    out.push(exc({
      jobId: l.job_id ?? undefined,
      jobNumber: l.job_id?.slice(0, 8),
      severity: "high", category: "state",
      title: "Blocked status transition",
      detail: `Attempted: ${l.context?.from ?? "?"} → ${l.context?.to ?? "?"}`,
      createdAt: l.created_at,
      actionLabel: "View job", actionRoute: l.job_id ? `/jobs/${l.job_id}` : "/admin",
    }));
  }

  const blockedResubmit = logEntries.filter(l => l.event === "blocked_inspection_resubmit");
  for (const l of blockedResubmit) {
    out.push(exc({
      jobId: l.job_id ?? undefined,
      jobNumber: l.job_id?.slice(0, 8),
      severity: "medium", category: "state",
      title: "Blocked inspection resubmission",
      detail: l.context?.reason ?? "Inspection already submitted",
      createdAt: l.created_at,
      actionLabel: "View job", actionRoute: l.job_id ? `/jobs/${l.job_id}` : "/admin",
    }));
  }

  return out;
}

/* ── Severity sort ─────────────────────────────────────────────── */

const SEV_ORDER: Record<ExceptionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortExceptions(exceptions: AttentionException[]): AttentionException[] {
  return [...exceptions].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
