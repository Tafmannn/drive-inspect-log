/**
 * Driver Job Summary Model
 *
 * Derives a normalized decision-support model from raw job data.
 * Each field exists to answer: what vehicle, what next, what constraint, why this order.
 */

import type { Job } from "./types";
import { TERMINAL_STATUSES } from "./statusConfig";

// ── Enums ────────────────────────────────────────────────────────────

export type WorkflowState =
  | "awaiting_pickup"
  | "pickup_active"
  | "in_transit"
  | "awaiting_delivery"
  | "delivery_active"
  | "pending_review"
  | "terminal";

export type ActionState =
  | "start_pickup"
  | "continue_job"
  | "start_delivery"
  | "view_pod"
  | "view_job";

export type PriorityState =
  | "recommended_now"
  | "due_soon"
  | "blocked"
  | "late_risk"
  | "normal";

export type ConstraintKind =
  | "do_not_deliver_before"
  | "booking_window"
  | "late_risk"
  | "blocked_until"
  | "special_instruction";

// ── Interfaces ───────────────────────────────────────────────────────

export interface Constraint {
  kind: ConstraintKind;
  label: string;
}

export interface DriverJobSummary {
  // Identity
  job_id: string;
  job_ref: string;
  vehicle_reg: string;
  client_name: string;

  // Derived states
  workflow_state: WorkflowState;
  action_state: ActionState;
  priority_state: PriorityState;
  recommendation_reason: string | null;
  constraints: Constraint[];

  // Addresses (compact)
  pickup_postcode: string;
  delivery_postcode: string;
  pickup_company: string | null;
  delivery_company: string | null;

  // Full contacts (both sides always visible)
  pickup_contact_name: string;
  pickup_contact_phone: string;
  pickup_address_full: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_address_full: string;

  // Current-phase contact
  current_contact_name: string;
  current_contact_phone: string;

  // Route economics
  route_distance_miles: number | null;
  route_eta_minutes: number | null;
  route_metrics_reliable: boolean;

  // CTA
  primary_cta: { label: string; route: string };
  nav_address: string;

  // Raw ref for deviation logic
  _raw: Job;
}

// ── Route Metric Freshness ───────────────────────────────────────────
// Route metrics are "reliable" if:
// 1. They exist (non-null)
// 2. maps_validated is true on the job
// Otherwise we display nothing rather than misleading data.

function areRouteMetricsReliable(job: Job): boolean {
  return (
    job.route_distance_miles != null &&
    job.route_eta_minutes != null &&
    job.maps_validated === true
  );
}

// ── Workflow State ───────────────────────────────────────────────────

function deriveWorkflowState(job: Job): WorkflowState {
  if ((TERMINAL_STATUSES as string[]).includes(job.status)) return "terminal";

  const s = job.status as string;
  switch (s) {
    case "ready_for_pickup":
    case "assigned":
    case "new":
      return "awaiting_pickup";
    case "pickup_in_progress":
      return "pickup_active";
    case "pickup_complete":
    case "in_transit":
      return job.has_pickup_inspection ? "in_transit" : "awaiting_pickup";
    case "delivery_in_progress":
      return "delivery_active";
    case "delivery_complete":
    case "pod_ready":
      return "pending_review";
    default:
      return "awaiting_pickup";
  }
}

// ── Action State ────────────────────────────────────────────────────

function deriveActionState(job: Job, workflow: WorkflowState): ActionState {
  if (workflow === "pending_review" || workflow === "terminal") return "view_pod";

  // Blocked by do-not-deliver-before → can only view
  if (isBlockedByDeliveryDate(job) && workflow === "in_transit") return "view_job";

  if (!job.has_pickup_inspection) return "start_pickup";

  if (
    workflow === "pickup_active" ||
    workflow === "in_transit" ||
    workflow === "awaiting_delivery"
  ) {
    if (!job.has_delivery_inspection) return "start_delivery";
    return "continue_job";
  }

  if (workflow === "delivery_active") return "continue_job";

  return "start_pickup";
}

// ── Time Helpers ────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function isBlockedByDeliveryDate(job: Job): boolean {
  return !!job.earliest_delivery_date && job.earliest_delivery_date > todayStr();
}

// ── Priority State ──────────────────────────────────────────────────

interface PriorityResult {
  state: PriorityState;
  reason: string | null;
}

function derivePriorityState(
  job: Job,
  workflow: WorkflowState,
  isTopRecommended: boolean
): PriorityResult {
  const today = todayStr();
  const now = nowMinutes();

  // Blocked: delivery date restriction
  if (isBlockedByDeliveryDate(job)) {
    return {
      state: "blocked",
      reason: `Cannot deliver before ${job.earliest_delivery_date}`,
    };
  }

  // Blocked: non-actionable statuses
  if (["draft", "incomplete", "cancelled", "failed"].includes(job.status)) {
    return { state: "blocked", reason: "Not actionable" };
  }

  // Late risk: pickup window is expiring
  if (job.pickup_time_to && job.job_date && job.job_date <= today) {
    const deadline = parseTimeToMinutes(job.pickup_time_to);
    if (deadline !== null && now > deadline - 60 && now <= deadline) {
      return {
        state: "late_risk",
        reason: `Pickup window closes at ${job.pickup_time_to}`,
      };
    }
    if (deadline !== null && now > deadline) {
      return {
        state: "late_risk",
        reason: `Pickup window closed at ${job.pickup_time_to}`,
      };
    }
  }

  // Late risk: promise_by_time approaching
  if (job.promise_by_time && job.job_date && job.job_date <= today) {
    const promiseMin = parseTimeToMinutes(job.promise_by_time);
    if (promiseMin !== null && now > promiseMin - 90) {
      return {
        state: "late_risk",
        reason: `Promise by ${job.promise_by_time}`,
      };
    }
  }

  // Due soon: has a pickup window starting today
  if (job.pickup_time_from && job.job_date && job.job_date <= today) {
    const startMin = parseTimeToMinutes(job.pickup_time_from);
    if (startMin !== null && now >= startMin - 30) {
      return {
        state: "due_soon",
        reason: `Pickup from ${job.pickup_time_from}`,
      };
    }
  }

  // Due soon: delivery date is today
  if (job.earliest_delivery_date && job.earliest_delivery_date === today) {
    return {
      state: "due_soon",
      reason: "Delivery date is today",
    };
  }

  // Due soon: job date is today
  if (job.job_date && job.job_date <= today) {
    return { state: "due_soon", reason: "Scheduled for today" };
  }

  // Recommended: top-ranked executable job
  if (isTopRecommended) {
    // Build a specific reason
    const reasons: string[] = [];
    if (workflow === "pickup_active" || workflow === "delivery_active") {
      reasons.push("In-progress workflow");
    } else if (job.pickup_time_from) {
      reasons.push(`Pickup from ${job.pickup_time_from}`);
    } else {
      reasons.push("Next in sequence");
    }
    return {
      state: "recommended_now",
      reason: reasons[0],
    };
  }

  return { state: "normal", reason: null };
}

// ── Constraints ─────────────────────────────────────────────────────

function deriveConstraints(job: Job): Constraint[] {
  const list: Constraint[] = [];

  if (job.earliest_delivery_date) {
    list.push({
      kind: "do_not_deliver_before",
      label: `Do not deliver before ${job.earliest_delivery_date}`,
    });
  }

  if (job.pickup_time_from || job.pickup_time_to) {
    const window = [job.pickup_time_from, job.pickup_time_to].filter(Boolean).join(" – ");
    list.push({ kind: "booking_window", label: `Pickup ${window}` });
  }

  if (job.delivery_time_from || job.delivery_time_to) {
    const window = [job.delivery_time_from, job.delivery_time_to].filter(Boolean).join(" – ");
    list.push({ kind: "booking_window", label: `Delivery ${window}` });
  }

  if (job.promise_by_time) {
    list.push({ kind: "booking_window", label: `Promise by ${job.promise_by_time}` });
  }

  if (job.delivery_access_notes) {
    list.push({ kind: "special_instruction", label: job.delivery_access_notes });
  }

  if (job.pickup_access_notes) {
    list.push({ kind: "special_instruction", label: job.pickup_access_notes });
  }

  return list;
}

// ── CTA ─────────────────────────────────────────────────────────────

function deriveCta(
  job: Job,
  action: ActionState
): { label: string; route: string } {
  switch (action) {
    case "start_pickup":
      return { label: "Start Pickup", route: `/inspection/${job.id}/pickup` };
    case "start_delivery":
      return { label: "Start Delivery", route: `/inspection/${job.id}/delivery` };
    case "continue_job":
      return { label: "Continue Job", route: `/jobs/${job.id}` };
    case "view_pod":
      return { label: "View POD", route: `/jobs/${job.id}/pod` };
    case "view_job":
      return { label: "View Job", route: `/jobs/${job.id}` };
  }
}

// ── Phase-aware contact ─────────────────────────────────────────────

function currentPhaseContact(job: Job, workflow: WorkflowState) {
  const isDeliveryPhase =
    workflow === "in_transit" ||
    workflow === "awaiting_delivery" ||
    workflow === "delivery_active" ||
    workflow === "pending_review";

  return {
    name: isDeliveryPhase ? job.delivery_contact_name : job.pickup_contact_name,
    phone: isDeliveryPhase ? job.delivery_contact_phone : job.pickup_contact_phone,
  };
}

function navAddress(job: Job, workflow: WorkflowState): string {
  const isDeliveryPhase =
    workflow === "in_transit" ||
    workflow === "awaiting_delivery" ||
    workflow === "delivery_active";

  return isDeliveryPhase
    ? [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(", ")
    : [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(", ");
}

// ── Main Derivation ─────────────────────────────────────────────────

export function deriveJobSummary(
  job: Job,
  isTopRecommended: boolean
): DriverJobSummary {
  const workflow = deriveWorkflowState(job);
  const action = deriveActionState(job, workflow);
  const priority = derivePriorityState(job, workflow, isTopRecommended);
  const contact = currentPhaseContact(job, workflow);

  return {
    job_id: job.id,
    job_ref: job.external_job_number || job.id.slice(0, 8),
    vehicle_reg: job.vehicle_reg,

    workflow_state: workflow,
    action_state: action,
    priority_state: priority.state,
    recommendation_reason: priority.reason,
    constraints: deriveConstraints(job),

    pickup_postcode: job.pickup_postcode,
    delivery_postcode: job.delivery_postcode,
    pickup_company: job.pickup_company,
    delivery_company: job.delivery_company,

    current_contact_name: contact.name,
    current_contact_phone: contact.phone,

    route_distance_miles: areRouteMetricsReliable(job) ? job.route_distance_miles! : null,
    route_eta_minutes: areRouteMetricsReliable(job) ? job.route_eta_minutes! : null,
    route_metrics_reliable: areRouteMetricsReliable(job),

    primary_cta: deriveCta(job, action),
    nav_address: navAddress(job, workflow),

    _raw: job,
  };
}

// ── Batch: derive summaries from ranked jobs ────────────────────────

export function deriveJobSummaries(jobs: Job[]): DriverJobSummary[] {
  // Import ranking inline to avoid circular dependency
  // The caller should pass already-ranked jobs
  // We find the top recommended: first executable non-terminal job
  const today = todayStr();
  
  // Simple ranking: in-progress first, then due today, then rest
  const inProgress = ["pickup_in_progress", "delivery_in_progress"];
  
  // Find the single recommended job
  let recommendedId: string | null = null;
  for (const job of jobs) {
    if ((TERMINAL_STATUSES as string[]).includes(job.status)) continue;
    if (["draft", "incomplete", "cancelled", "failed"].includes(job.status)) continue;
    if (inProgress.includes(job.status)) {
      recommendedId = job.id;
      break;
    }
  }
  // If no in-progress, find first due-today executable
  if (!recommendedId) {
    for (const job of jobs) {
      if ((TERMINAL_STATUSES as string[]).includes(job.status)) continue;
      if (["draft", "incomplete", "cancelled", "failed"].includes(job.status)) continue;
      if (isBlockedByDeliveryDate(job)) continue;
      if (["delivery_complete", "pod_ready"].includes(job.status)) continue;
      recommendedId = job.id;
      break;
    }
  }

  return jobs.map((job) =>
    deriveJobSummary(job, job.id === recommendedId)
  );
}
