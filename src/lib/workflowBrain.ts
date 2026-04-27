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

// ════════════════════════════════════════════════════════════════════
// Stage 1 — getWorkflowBrain (Axentra OS workflow intelligence layer)
// ════════════════════════════════════════════════════════════════════
//
// Public API used by dashboard cards, driver job cards and the admin
// job list. Returns a richer shape than `deriveWorkflowState`:
//
//   • driverNextAction / adminNextAction — split because driver and
//     admin look at the same job through very different lenses.
//   • podReadiness / invoiceReadiness — explicit gates with
//     human-friendly reasons.
//   • riskLevel — single ordinal badge so cards can surface trouble
//     without duplicating gate logic.
//   • blockers / warnings — separated. Blockers stop progression;
//     warnings are advisory and never stop progression.
//   • debug — small, opt-out-able diagnostic payload for support tooling.
//
// Hard rules from the brief:
//   • delivery_complete is NOT completed.
//   • pod_ready is NOT completed.
//   • Only completed/closed jobs can ever be invoice-ready.
//   • Unknown statuses do NOT crash. They return a warning and a safe
//     "unknown" phase so the UI can render gracefully.
//   • No new database statuses invented.

const KNOWN_STATUSES: ReadonlySet<string> = new Set(
  Object.values(JOB_STATUS) as string[],
);

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface BrainAction {
  /** Human-friendly CTA. NEVER raw status text. */
  label: string;
  /** Stable machine code so cards can branch without parsing copy. */
  code:
    | "start_pickup"
    | "continue_pickup"
    | "start_delivery"
    | "continue_delivery"
    | "deliver_in_transit"
    | "review_pod"
    | "raise_invoice"
    | "view_pod"
    | "assign_driver"
    | "investigate"
    | "none";
  /** Optional route hint. Cards may ignore and use their own routing. */
  route?: string;
  disabled?: boolean;
  reason?: string;
}

export interface ReadinessGate {
  ready: boolean;
  blockers: string[];
}

export interface WorkflowBrain {
  /** Same phase taxonomy as deriveWorkflowState, plus "unknown". */
  phase: WorkflowPhase | "unknown";
  /** Action the driver should take next. Null = nothing for driver to do. */
  driverNextAction: BrainAction | null;
  /** Action an admin should take next. Null = nothing for admin to do. */
  adminNextAction: BrainAction | null;
  podReadiness: ReadinessGate;
  invoiceReadiness: ReadinessGate;
  riskLevel: RiskLevel;
  /** Human-friendly. Stop-the-world conditions. NO JSON. */
  blockers: string[];
  /** Human-friendly. Advisory only — never block progression. */
  warnings: string[];
  debug: {
    rawStatus: string;
    statusKnown: boolean;
    podBlockerCodes: string[];
    invoiceBlockerCodes: string[];
  };
}

/**
 * Lightweight job shape accepted by getWorkflowBrain. We only need the
 * fields actually consulted, which lets callers pass admin-list rows
 * (subset of Job) without casting.
 */
export interface BrainJobLike {
  id: string;
  status: string;
  driver_id?: string | null;
  current_run_id?: string | null;
  has_pickup_inspection?: boolean;
  has_delivery_inspection?: boolean;
  pod_pdf_url?: string | null;
  total_price?: number | null;
  admin_rate?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  external_job_number?: string | null;
}

export interface BrainInput {
  job: BrainJobLike;
  inspections?: Inspection[] | null;
  photos?: Photo[] | null;
  siblingJobs?: Job[];
  pendingUploads?: { failedCount: number; blockedCount?: number } | null;
  /**
   * Optional admin POD approval signal. The schema does not yet have an
   * explicit "POD approved" column — admins approve by closing the job
   * (status → completed) or by adding a separate review record. Until
   * that column exists, callers can pass `podApproved: true` when they
   * have first-hand knowledge (e.g. AdminPodReview just clicked
   * "Approve"). Defaults to: approved iff status === completed.
   */
  podApproved?: boolean;
}

function pricingPresent(job: BrainJobLike): boolean {
  // Either a customer-facing total or an admin-set rate counts as
  // "priced". Both are nullable in the DB; treat 0 as "not priced".
  const total = typeof job.total_price === "number" ? job.total_price : null;
  const admin = typeof job.admin_rate === "number" ? job.admin_rate : null;
  return (total !== null && total > 0) || (admin !== null && admin > 0);
}

function clientPresent(job: BrainJobLike): boolean {
  if (job.client_id && job.client_id.trim().length > 0) return true;
  if (job.client_name && job.client_name.trim().length > 0) return true;
  return false;
}

export function getWorkflowBrain(input: BrainInput): WorkflowBrain {
  const { job, inspections, photos, siblingJobs, pendingUploads, podApproved } =
    input;

  const rawStatus = job.status ?? "";
  const statusKnown = KNOWN_STATUSES.has(rawStatus);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!statusKnown) {
    warnings.push(
      `Unknown job status "${rawStatus || "(empty)"}". The workflow intelligence layer cannot make progression decisions for this job.`,
    );
    return {
      phase: "unknown",
      driverNextAction: null,
      adminNextAction: {
        label: "Investigate job",
        code: "investigate",
        route: `/jobs/${job.id}`,
      },
      podReadiness: {
        ready: false,
        blockers: ["Status is unknown — POD readiness cannot be determined."],
      },
      invoiceReadiness: {
        ready: false,
        blockers: ["Status is unknown — invoice readiness cannot be determined."],
      },
      riskLevel: "medium",
      blockers,
      warnings,
      debug: {
        rawStatus,
        statusKnown: false,
        podBlockerCodes: ["status_unknown"],
        invoiceBlockerCodes: ["status_unknown"],
      },
    };
  }

  // Reuse the existing deriveWorkflowState for phase + readiness +
  // evidence so we don't drift from the unit-tested base layer.
  const base = deriveWorkflowState({
    job: job as Job & { current_run_id?: string | null },
    inspections: inspections ?? [],
    photos: photos ?? [],
    siblingJobs,
    pendingUploads,
  });

  // Carry through human-friendly base blockers as warnings if they're
  // advisory (active-job lock is the most common one and is genuinely
  // blocking — keep it as a blocker).
  const lock = base.blockers.find((b) => b.code === "active_job_lock");
  if (lock) blockers.push(lock.message);

  // ── POD readiness ─────────────────────────────────────────────────
  const podBlockerCodes: string[] = [];
  const podBlockerMessages: string[] = [];
  for (const b of base.blockers) {
    if (
      b.code === "missing_delivery_inspection" ||
      b.code === "missing_delivery_photos" ||
      b.code === "missing_driver_signature" ||
      b.code === "missing_customer_signature" ||
      b.code === "blocked_uploads" ||
      b.code === "stale_run_evidence"
    ) {
      podBlockerCodes.push(b.code);
      podBlockerMessages.push(b.message);
    }
  }
  // POD has no meaning before delivery_in_progress.
  const podRelevant =
    rawStatus === JOB_STATUS.DELIVERY_IN_PROGRESS ||
    rawStatus === JOB_STATUS.DELIVERY_COMPLETE ||
    rawStatus === JOB_STATUS.POD_READY ||
    rawStatus === JOB_STATUS.COMPLETED;

  // podRelevant already excludes CANCELLED via the status whitelist above.
  const podReady = podRelevant && podBlockerCodes.length === 0;

  const podReadiness: ReadinessGate = {
    ready: podReady,
    blockers: podRelevant
      ? podBlockerMessages
      : ["POD is not yet relevant for this stage."],
  };

  // ── Invoice readiness ─────────────────────────────────────────────
  // Hard rule: only completed/closed jobs can be invoice-ready.
  const invoiceBlockerCodes: string[] = [];
  const invoiceBlockerMessages: string[] = [];

  const isCompleted = rawStatus === JOB_STATUS.COMPLETED;
  if (!isCompleted) {
    invoiceBlockerCodes.push("not_completed");
    if (
      rawStatus === JOB_STATUS.POD_READY ||
      rawStatus === JOB_STATUS.DELIVERY_COMPLETE
    ) {
      invoiceBlockerMessages.push(
        "Job is awaiting admin review. It must be closed before invoicing.",
      );
    } else {
      invoiceBlockerMessages.push("Job must be completed before invoicing.");
    }
  }
  if (!pricingPresent(job)) {
    invoiceBlockerCodes.push("missing_price");
    invoiceBlockerMessages.push("Job has no agreed price or admin rate.");
  }
  if (!clientPresent(job)) {
    invoiceBlockerCodes.push("missing_client");
    invoiceBlockerMessages.push("Job has no billable client on record.");
  }
  // POD approval signal. Defaults to "approved iff completed".
  const podApprovedResolved = podApproved ?? isCompleted;
  if (isCompleted && !podApprovedResolved) {
    invoiceBlockerCodes.push("pod_not_approved");
    invoiceBlockerMessages.push("POD has not been approved by an admin.");
  }

  const invoiceReadiness: ReadinessGate = {
    ready: invoiceBlockerCodes.length === 0,
    blockers: invoiceBlockerMessages,
  };

  // ── Driver next action ────────────────────────────────────────────
  let driverNextAction: BrainAction | null = null;
  if (rawStatus === JOB_STATUS.CANCELLED) {
    driverNextAction = null;
  } else if (
    rawStatus === JOB_STATUS.COMPLETED ||
    rawStatus === JOB_STATUS.ARCHIVED ||
    rawStatus === JOB_STATUS.POD_READY ||
    rawStatus === JOB_STATUS.DELIVERY_COMPLETE
  ) {
    // Driver is done with this job — admin owns it now.
    driverNextAction = null;
  } else if (!job.driver_id) {
    driverNextAction = null;
  } else if (lock) {
    driverNextAction = {
      label: "Locked",
      code: "none",
      disabled: true,
      reason: lock.message,
    };
  } else if (rawStatus === JOB_STATUS.PICKUP_IN_PROGRESS) {
    driverNextAction = {
      label: "Continue pickup inspection",
      code: "continue_pickup",
      route: `/inspection/${job.id}/pickup`,
    };
  } else if (
    rawStatus === JOB_STATUS.READY_FOR_PICKUP ||
    rawStatus === JOB_STATUS.ASSIGNED ||
    rawStatus === JOB_STATUS.NEW
  ) {
    driverNextAction = {
      label: "Start pickup inspection",
      code: "start_pickup",
      route: `/inspection/${job.id}/pickup`,
    };
  } else if (rawStatus === JOB_STATUS.DELIVERY_IN_PROGRESS) {
    driverNextAction = {
      label: "Continue delivery inspection",
      code: "continue_delivery",
      route: `/inspection/${job.id}/delivery`,
    };
  } else if (
    rawStatus === JOB_STATUS.IN_TRANSIT ||
    rawStatus === JOB_STATUS.PICKUP_COMPLETE
  ) {
    driverNextAction = {
      label: "Start delivery inspection",
      code: "start_delivery",
      route: `/inspection/${job.id}/delivery`,
    };
  }

  // ── Admin next action ─────────────────────────────────────────────
  let adminNextAction: BrainAction | null = null;
  if (rawStatus === JOB_STATUS.CANCELLED) {
    adminNextAction = null;
  } else if (
    rawStatus === JOB_STATUS.DELIVERY_COMPLETE ||
    rawStatus === JOB_STATUS.POD_READY
  ) {
    adminNextAction = {
      label: "Review POD",
      code: "review_pod",
      route: `/admin/pod-review?jobId=${job.id}`,
    };
  } else if (rawStatus === JOB_STATUS.COMPLETED) {
    if (invoiceReadiness.ready) {
      adminNextAction = {
        label: "Raise invoice",
        code: "raise_invoice",
        route: `/admin/invoices/new?jobId=${job.id}`,
      };
    } else {
      adminNextAction = {
        label: "View POD",
        code: "view_pod",
        route: `/pod-report/${job.id}`,
        disabled: false,
        reason: invoiceBlockerMessages[0],
      };
    }
  } else if (!job.driver_id && rawStatus !== JOB_STATUS.DRAFT) {
    adminNextAction = {
      label: "Assign driver",
      code: "assign_driver",
      route: `/admin/jobs?filter=unassigned&jobId=${job.id}`,
    };
  }

  // ── Risk level ────────────────────────────────────────────────────
  let riskLevel: RiskLevel = "none";
  if (lock) riskLevel = "high";
  else if (
    rawStatus === JOB_STATUS.FAILED ||
    rawStatus === JOB_STATUS.INCOMPLETE
  ) {
    riskLevel = "high";
  } else if (
    pendingUploads &&
    ((pendingUploads.blockedCount ?? 0) > 0 || pendingUploads.failedCount > 0)
  ) {
    riskLevel = "medium";
  } else if (podRelevant && podBlockerCodes.length > 0) {
    riskLevel = "medium";
  } else if (
    !job.driver_id &&
    rawStatus !== JOB_STATUS.DRAFT &&
    rawStatus !== JOB_STATUS.CANCELLED &&
    rawStatus !== JOB_STATUS.COMPLETED
  ) {
    riskLevel = "low";
  }

  // ── Advisory warnings (do not block) ──────────────────────────────
  if (rawStatus === JOB_STATUS.DRAFT) {
    warnings.push("Job is still a draft — it will not appear in driver queues.");
  }
  if (
    rawStatus === JOB_STATUS.COMPLETED &&
    !invoiceReadiness.ready &&
    invoiceBlockerCodes.includes("missing_price")
  ) {
    warnings.push("This completed job has no price set — invoicing is blocked.");
  }
  if (
    rawStatus === JOB_STATUS.COMPLETED &&
    !invoiceReadiness.ready &&
    invoiceBlockerCodes.includes("missing_client")
  ) {
    warnings.push("This completed job has no client on record — invoicing is blocked.");
  }

  return {
    phase: base.phase,
    driverNextAction,
    adminNextAction,
    podReadiness,
    invoiceReadiness,
    riskLevel,
    blockers,
    warnings,
    debug: {
      rawStatus,
      statusKnown: true,
      podBlockerCodes,
      invoiceBlockerCodes,
    },
  };
}
