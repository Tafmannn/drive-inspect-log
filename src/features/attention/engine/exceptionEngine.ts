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

function stablePart(value: string | undefined, fallback: string): string {
  const text = (value ?? fallback).toLowerCase().trim();
  const slug = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function hashText(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Stable ID so acknowledgements survive refetches/navigation. */
function stableExcId(partial: Omit<AttentionException, "id">): string {
  const jobPart = partial.jobId ?? "global";
  const titlePart = stablePart(partial.title, "exception");
  const detailPart = hashText(partial.detail ?? "");
  return `${partial.category}:${jobPart}:${titlePart}:${detailPart}`;
}

function minutesAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function exc(
  partial: Omit<AttentionException, "id">,
): AttentionException {
  return { ...partial, id: stableExcId(partial) };
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

/* ── Sync exceptions (legacy: from client_logs only) ───────────── */

export function deriveSyncExceptions(
  logEntries: { event: string; created_at: string; context: any }[],
): AttentionException[] {
  const out: AttentionException[] = [];

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

/* ── Compliance exceptions (onboarding docs + driver profiles) ──── */

interface OnboardingDocRow {
  id: string;
  related_type: string;
  related_id: string;
  document_type: string;
  expires_at: string | null;
  org_id: string;
}

interface DriverComplianceRow {
  user_id: string;
  full_name: string | null;
  org_id: string;
  licence_expiry: string | null;
  right_to_work: string | null;
  bank_captured: boolean | null;
  is_active: boolean | null;
  archived_at: string | null;
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function deriveComplianceExceptions(
  documents: OnboardingDocRow[],
  drivers: DriverComplianceRow[],
  driverNameLookup?: Map<string, string>,
  orgLookup?: Map<string, string>,
  /** driver_profiles.id → driver_profiles.user_id (route param for /admin/drivers/:userId) */
  driverUserIdLookup?: Map<string, string>,
): AttentionException[] {
  const out: AttentionException[] = [];
  const warnDays = T.documentExpiryWarnDays;
  const now = new Date().toISOString();

  // Document expiry
  for (const d of documents) {
    if (!d.expires_at) continue;
    const days = daysUntil(d.expires_at);
    if (days > warnDays) continue;

    const orgName = orgLookup?.get(d.org_id);
    let subjectName = d.related_type;
    let route = "/control/compliance";
    let actionLabel = "Open compliance";

    if (d.related_type === "driver") {
      subjectName = driverNameLookup?.get(d.related_id) ?? "Driver";
      const userId = driverUserIdLookup?.get(d.related_id);
      // If we cannot resolve the auth user_id, fall back to the drivers list
      // rather than producing a route that yields a blank profile page.
      route = userId ? `/admin/drivers/${userId}` : "/admin/drivers";
      actionLabel = "Open driver";
    } else if (d.related_type === "client") {
      route = `/admin/clients/${d.related_id}`;
      actionLabel = "Open client";
      subjectName = "Client";
    } else if (d.related_type === "organisation" || d.related_type === "org") {
      route = `/super-admin/orgs/${d.related_id}`;
      actionLabel = "Open organisation";
      subjectName = "Organisation";
    }

    const expired = days < 0;
    out.push(exc({
      jobId: undefined,
      orgId: d.org_id,
      orgName,
      severity: expired ? "high" : days <= 7 ? "high" : "medium",
      category: "compliance",
      title: expired ? `Expired: ${d.document_type}` : `Expires in ${days}d: ${d.document_type}`,
      detail: `${subjectName} — ${d.document_type}${expired ? " (overdue)" : ""}`,
      createdAt: now,
      actionLabel,
      actionRoute: route,
    }));
  }

  // Driver-level compliance gaps (active drivers only)
  for (const drv of drivers) {
    if (drv.archived_at || drv.is_active === false) continue;
    const orgName = orgLookup?.get(drv.org_id);
    const base = {
      orgId: drv.org_id,
      orgName,
      jobId: undefined,
      createdAt: now,
      actionLabel: "Open driver",
      actionRoute: `/admin/drivers/${drv.user_id}`,
    };
    const name = drv.full_name?.trim() || "Driver";

    if (!drv.licence_expiry) {
      out.push(exc({
        ...base, severity: "medium", category: "compliance",
        title: "Missing licence expiry",
        detail: `${name} — no licence expiry on file`,
      }));
    } else {
      const days = daysUntil(drv.licence_expiry);
      if (days <= warnDays) {
        out.push(exc({
          ...base,
          severity: days < 0 ? "high" : days <= 7 ? "high" : "medium",
          category: "compliance",
          title: days < 0 ? "Driving licence expired" : `Licence expires in ${days}d`,
          detail: `${name} — licence ${days < 0 ? "overdue" : "renewal due"}`,
        }));
      }
    }

    if (!drv.right_to_work?.trim()) {
      out.push(exc({
        ...base, severity: "medium", category: "compliance",
        title: "Right to work not captured",
        detail: `${name} — RTW status missing`,
      }));
    }
    if (!drv.bank_captured) {
      out.push(exc({
        ...base, severity: "low", category: "compliance",
        title: "Bank details not captured",
        detail: `${name} — payout details missing`,
      }));
    }
  }

  return out;
}

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
