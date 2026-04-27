/**
 * workflowBrain — single source of truth for "what state is this job in
 * and what should happen next?".
 *
 * Why this exists
 * ───────────────
 * Job lifecycle decisions (which button to show, whether POD can be
 * generated, whether the job should count as completed) were duplicated
 * across JobDetail, PodReport, JobCard and admin queues. Each call site
 * recomputed the same predicates from `job.status`, `job.has_*_inspection`
 * and ad-hoc photo filters. Two failure modes followed:
 *
 *   • Drift. A rule tightened in one place (e.g. "POD requires a customer
 *     signature") would silently regress everywhere else.
 *   • Stale-run leakage into POD readiness. The naive "do we have a
 *     delivery inspection?" check did not consider whether the inspection
 *     belonged to the job's *current* run after an admin reopen.
 *
 * This module accepts a Job + its inspections + photos + per-job pending
 * upload summary and returns a fully-derived WorkflowState. It is a pure
 * function: no React, no Supabase, no IO. Easy to unit-test, cheap to
 * call from any component.
 *
 * It composes — not replaces — `evaluateExecutableState` (which owns the
 * cross-job active-job lock) and `canonicalisePhotos` (which owns
 * run-isolation + dedupe).
 */

import type { Job, Inspection, Photo, JobWithRelations } from "./types";
import { JOB_STATUS, TERMINAL_STATUSES, type JobStatusValue } from "./statusConfig";
import { canonicalisePhotos } from "./photoDedupe";
import { evaluateExecutableState } from "./executionRanking";

// ── Phase taxonomy ───────────────────────────────────────────────────
//
// `phase` is an opinionated rollup of `Job.status` for UI consumption.
// Multiple raw statuses can map onto the same phase (e.g. pod_ready and
// delivery_complete both → "pod_ready") so callers don't have to repeat
// that mapping themselves. See objective 7 of the upgrade brief.

export type WorkflowPhase =
  | "awaiting_pickup"
  | "pickup_in_progress"
  | "in_transit"
  | "awaiting_delivery"
  | "delivery_in_progress"
  | "pod_ready"
  | "completed"
  | "cancelled"
  | "on_hold";

export interface WorkflowAction {
  /** Human-friendly label for the primary CTA. Never raw status text. */
  label: string;
  /** Route the CTA should navigate to. Relative to app root. */
  route: string;
  /** True when the action should render disabled. */
  disabled?: boolean;
  /** Why it's disabled, if applicable. Human-friendly. */
  reason?: string;
}

export interface WorkflowBlocker {
  /** Stable machine code so callers can branch / log without parsing copy. */
  code:
    | "missing_pickup_inspection"
    | "missing_delivery_inspection"
    | "missing_pickup_photos"
    | "missing_delivery_photos"
    | "missing_driver_signature"
    | "missing_customer_signature"
    | "blocked_uploads"
    | "active_job_lock"
    | "not_actionable"
    | "stale_run_evidence";
  /** Human-friendly. Safe to render in toasts / panels. NO JSON. */
  message: string;
}

export interface WorkflowReadiness {
  canStartPickup: boolean;
  canStartDelivery: boolean;
  /**
   * True iff the job has a complete delivery inspection on the current
   * run, signatures resolvable, ≥1 delivery photo on the current run
   * (legacy null-run fallback applied via canonicalisePhotos), and no
   * blocked uploads outstanding.
   */
  canGeneratePod: boolean;
  /**
   * True iff the job is in a terminal-eligible state. Both pod_ready
   * and delivery_complete count, matching dashboard rollups (objective 7).
   */
  canCloseJob: boolean;
}

export interface WorkflowEvidence {
  pickupPhotos: Photo[];
  deliveryPhotos: Photo[];
  pickupInspection: Inspection | null;
  deliveryInspection: Inspection | null;
}

export interface WorkflowState {
  phase: WorkflowPhase;
  nextAction: WorkflowAction | null;
  blockers: WorkflowBlocker[];
  readiness: WorkflowReadiness;
  evidence: WorkflowEvidence;
}

// ── Inputs ───────────────────────────────────────────────────────────

export interface WorkflowInput {
  job: Job & { current_run_id?: string | null };
  inspections?: Inspection[] | null;
  photos?: Photo[] | null;
  /**
   * Sibling jobs assigned to the same driver. Used purely to forward to
   * `evaluateExecutableState` so the active-job lock surfaces as a
   * blocker. Optional — when omitted, the lock is not evaluated.
   */
  siblingJobs?: Job[];
  /**
   * Per-job pending upload summary. The brain only needs to know whether
   * any uploads are blocked or failed to gate POD generation. Pass
   * `null` if you don't have it yet (UI should treat as "unknown" — POD
   * stays disabled until uploads are resolvable).
   */
  pendingUploads?: {
    failedCount: number;
    blockedCount?: number;
  } | null;
}

// ── Status → phase mapping ───────────────────────────────────────────

function deriveBasePhase(status: JobStatusValue | string): WorkflowPhase {
  switch (status) {
    case JOB_STATUS.CANCELLED:
      return "cancelled";
    case JOB_STATUS.COMPLETED:
    case JOB_STATUS.ARCHIVED:
      return "completed";
    case JOB_STATUS.POD_READY:
    case JOB_STATUS.DELIVERY_COMPLETE:
      return "pod_ready";
    case JOB_STATUS.DELIVERY_IN_PROGRESS:
      return "delivery_in_progress";
    case JOB_STATUS.IN_TRANSIT:
    case JOB_STATUS.PICKUP_COMPLETE:
      // PICKUP_COMPLETE collapses into in_transit — there is no separate
      // "post-pickup, pre-transit" UI state.
      return "in_transit";
    case JOB_STATUS.PICKUP_IN_PROGRESS:
      return "pickup_in_progress";
    case JOB_STATUS.READY_FOR_PICKUP:
    case JOB_STATUS.ASSIGNED:
    case JOB_STATUS.NEW:
      return "awaiting_pickup";
    case JOB_STATUS.DRAFT:
    case JOB_STATUS.INCOMPLETE:
    case JOB_STATUS.PENDING:
    case JOB_STATUS.FAILED:
      return "on_hold";
    default:
      return "on_hold";
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function pickInspection(
  inspections: Inspection[],
  type: "pickup" | "delivery",
): Inspection | null {
  // Most recent first. Inspections are append-only post-Phase 1, but
  // legacy data can have multiples — prefer the latest by inspected_at
  // then created_at.
  const matches = inspections.filter((i) => i.type === type);
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const aT = a.inspected_at || a.created_at || "";
    const bT = b.inspected_at || b.created_at || "";
    return bT.localeCompare(aT);
  });
  return matches[0];
}

function isPickupPhotoType(t: string): boolean {
  return t.startsWith("pickup") || t === "odometer_pickup" || t === "fuel_pickup";
}
function isDeliveryPhotoType(t: string): boolean {
  return t.startsWith("delivery") || t === "odometer_delivery" || t === "fuel_delivery";
}

// ── Main ─────────────────────────────────────────────────────────────

export function deriveWorkflowState(input: WorkflowInput): WorkflowState {
  const { job, inspections = [], photos = [], siblingJobs, pendingUploads } = input;
  const safeInspections = inspections ?? [];
  const safePhotos = photos ?? [];
  const currentRunId = job.current_run_id ?? null;

  // Canonicalise photos once — the rest of the brain reads from these.
  const canonical = canonicalisePhotos(safePhotos, currentRunId);
  const pickupPhotos = canonical.filter((p) => isPickupPhotoType(p.type));
  const deliveryPhotos = canonical.filter((p) => isDeliveryPhotoType(p.type));

  const pickupInspection = pickInspection(safeInspections, "pickup");
  const deliveryInspection = pickInspection(safeInspections, "delivery");

  const phase = deriveBasePhase(job.status);
  const blockers: WorkflowBlocker[] = [];

  // Active-job lock surfaces as a blocker but does not change phase.
  if (siblingJobs && siblingJobs.length > 0) {
    const exec = evaluateExecutableState(job, siblingJobs);
    if (exec.state === "blocked" && exec.reason && /Complete Job/i.test(exec.reason)) {
      blockers.push({ code: "active_job_lock", message: exec.reason });
    } else if (exec.state === "blocked") {
      blockers.push({ code: "not_actionable", message: exec.reason || "Not actionable" });
    }
  }

  const isTerminal = (TERMINAL_STATUSES as string[]).includes(job.status);
  const isCancelled = job.status === JOB_STATUS.CANCELLED;
  const driverAssigned = !!job.driver_id;

  // Readiness gates ---------------------------------------------------
  const canStartPickup =
    !isTerminal &&
    !isCancelled &&
    driverAssigned &&
    blockers.find((b) => b.code === "active_job_lock") === undefined &&
    (job.status === JOB_STATUS.READY_FOR_PICKUP ||
      job.status === JOB_STATUS.ASSIGNED ||
      job.status === JOB_STATUS.PICKUP_IN_PROGRESS);

  const canStartDelivery =
    !isTerminal &&
    !isCancelled &&
    driverAssigned &&
    blockers.find((b) => b.code === "active_job_lock") === undefined &&
    (job.status === JOB_STATUS.IN_TRANSIT ||
      job.status === JOB_STATUS.PICKUP_COMPLETE ||
      job.status === JOB_STATUS.DELIVERY_IN_PROGRESS);

  // POD readiness: tightened per objective 7 -------------------------
  const failedUploads = pendingUploads?.failedCount ?? 0;
  const blockedUploads = pendingUploads?.blockedCount ?? 0;
  const hasUploadIssues = failedUploads > 0 || blockedUploads > 0;

  const podBlockers: WorkflowBlocker[] = [];
  if (!deliveryInspection) {
    podBlockers.push({
      code: "missing_delivery_inspection",
      message: "Delivery inspection is not yet recorded.",
    });
  }
  if (deliveryPhotos.length === 0) {
    podBlockers.push({
      code: "missing_delivery_photos",
      message: "No delivery photos found for the current job run.",
    });
  }
  if (deliveryInspection && !deliveryInspection.driver_signature_url) {
    podBlockers.push({
      code: "missing_driver_signature",
      message: "Driver signature is missing from the delivery inspection.",
    });
  }
  if (deliveryInspection && !deliveryInspection.customer_signature_url) {
    podBlockers.push({
      code: "missing_customer_signature",
      message: "Customer signature is missing from the delivery inspection.",
    });
  }
  if (hasUploadIssues) {
    podBlockers.push({
      code: "blocked_uploads",
      message: "Some photos haven't uploaded yet. Resolve them in Pending Uploads.",
    });
  }
  // Stale-run guard: delivery inspection exists but doesn't belong to
  // the current run. canonicalisePhotos already filtered photos; this
  // catches the inspection-side leak.
  if (
    currentRunId &&
    deliveryInspection &&
    (deliveryInspection as any).run_id != null &&
    (deliveryInspection as any).run_id !== currentRunId
  ) {
    podBlockers.push({
      code: "stale_run_evidence",
      message: "Delivery inspection belongs to a previous job run.",
    });
  }

  const canGeneratePod = !isTerminal && !isCancelled && podBlockers.length === 0;

  // Surface POD blockers only when we're at/past the delivery stage.
  // Showing "missing delivery photos" on a freshly-created job would be
  // noise.
  const isLateStage =
    phase === "delivery_in_progress" || phase === "pod_ready" || phase === "completed";
  if (isLateStage) {
    blockers.push(...podBlockers);
  }

  const canCloseJob =
    job.status === JOB_STATUS.POD_READY ||
    job.status === JOB_STATUS.DELIVERY_COMPLETE;

  // Next action -------------------------------------------------------
  let nextAction: WorkflowAction | null = null;
  if (isCancelled) {
    nextAction = null;
  } else if (isTerminal) {
    nextAction = {
      label: "View POD",
      route: `/pod-report/${job.id}`,
    };
  } else if (phase === "pod_ready") {
    nextAction = {
      label: canGeneratePod ? "Review POD" : "Resolve POD blockers",
      route: `/pod-report/${job.id}`,
      disabled: !canGeneratePod,
      reason: canGeneratePod ? undefined : podBlockers[0]?.message,
    };
  } else if (canStartDelivery) {
    nextAction = {
      label:
        job.status === JOB_STATUS.DELIVERY_IN_PROGRESS
          ? "Continue delivery inspection"
          : "Start delivery inspection",
      route: `/inspection/${job.id}/delivery`,
    };
  } else if (canStartPickup) {
    nextAction = {
      label:
        job.status === JOB_STATUS.PICKUP_IN_PROGRESS
          ? "Continue pickup inspection"
          : "Start pickup inspection",
      route: `/inspection/${job.id}/pickup`,
    };
  } else if (!driverAssigned) {
    nextAction = {
      label: "Awaiting driver assignment",
      route: `/jobs/${job.id}`,
      disabled: true,
      reason: "No driver assigned yet.",
    };
  } else if (blockers.find((b) => b.code === "active_job_lock")) {
    const lock = blockers.find((b) => b.code === "active_job_lock")!;
    nextAction = {
      label: "Locked",
      route: `/jobs/${job.id}`,
      disabled: true,
      reason: lock.message,
    };
  }

  return {
    phase,
    nextAction,
    blockers,
    readiness: {
      canStartPickup,
      canStartDelivery,
      canGeneratePod,
      canCloseJob,
    },
    evidence: {
      pickupPhotos,
      deliveryPhotos,
      pickupInspection,
      deliveryInspection,
    },
  };
}

/**
 * Convenience overload for callers that already have a JobWithRelations.
 */
export function deriveWorkflowStateFromJob(
  job: JobWithRelations & { current_run_id?: string | null },
  extra?: {
    siblingJobs?: Job[];
    pendingUploads?: WorkflowInput["pendingUploads"];
  },
): WorkflowState {
  return deriveWorkflowState({
    job,
    inspections: job.inspections,
    photos: job.photos,
    siblingJobs: extra?.siblingJobs,
    pendingUploads: extra?.pendingUploads,
  });
}
