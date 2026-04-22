/**
 * Execution Ranking — Two-stage lattice system.
 *
 * Stage A: Partition into execution classes
 *   1. current_active — in-progress workflow
 *   2. eligible_due_now — timing-constrained, executable today
 *   3. eligible_due_later — ready but no immediate deadline
 *   4. assigned_but_ineligible — blocked by prior step or restriction
 *   5. terminal — completed/cancelled/archived
 *
 * Stage B: Sort within class deterministically by:
 *   - workflow continuation priority
 *   - hard timing constraints
 *   - route adjacency (postcode prefix continuity)
 *   - job_date
 *   - created_at
 */

import type { Job } from "./types";
import { TERMINAL_STATUSES } from "./statusConfig";

// ── Executable State ─────────────────────────────────────────────────

export type ExecutableState = "executable" | "review_only" | "blocked";

export interface ExecutableEvaluation {
  state: ExecutableState;
  reason: string;
}

/**
 * Evaluate whether a job is executable, review-only, or blocked.
 * Checks workflow status and active-job lock (driver has another in-progress job).
 *
 * @param job - The job to evaluate
 * @param siblingJobs - All jobs assigned to the same driver (for active-job lock)
 */
export function evaluateExecutableState(
  job: Job,
  siblingJobs?: Job[],
): ExecutableEvaluation {
  // Terminal jobs are review-only
  if ((TERMINAL_STATUSES as string[]).includes(job.status)) {
    return { state: "review_only", reason: "Completed" };
  }

  // Pending statuses (delivery_complete, pod_ready) are review-only
  if (["delivery_complete", "pod_ready"].includes(job.status)) {
    return { state: "review_only", reason: "Awaiting review" };
  }

  // Draft/incomplete/cancelled are blocked
  if (["draft", "incomplete", "cancelled", "failed"].includes(job.status)) {
    return { state: "blocked", reason: "Not actionable" };
  }

  // Active-job lock: if driver has another in-progress job, block this one
  if (siblingJobs && siblingJobs.length > 0) {
    const inProgressStatuses = ["pickup_in_progress", "delivery_in_progress"];
    const thisIsInProgress = inProgressStatuses.includes(job.status);
    if (!thisIsInProgress) {
      const blockingJob = siblingJobs.find(
        (s) =>
          s.id !== job.id &&
          inProgressStatuses.includes(s.status) &&
          s.driver_id !== null &&
          s.driver_id === job.driver_id
      );
      if (blockingJob) {
        const blockRef = blockingJob.external_job_number || blockingJob.id.slice(0, 8);
        return {
          state: "blocked",
          reason: `Complete Job ${blockRef} first`,
        };
      }
    }
  }

  // Default: executable
  return { state: "executable", reason: "" };
}

// ── Execution Class ──────────────────────────────────────────────────

export type ExecutionClass =
  | "current_active"
  | "eligible_due_now"
  | "eligible_due_later"
  | "assigned_but_ineligible"
  | "terminal";

const CLASS_RANK: Record<ExecutionClass, number> = {
  current_active: 1,
  eligible_due_now: 2,
  eligible_due_later: 3,
  assigned_but_ineligible: 4,
  terminal: 5,
};

const IN_PROGRESS_STATUSES = [
  "pickup_in_progress",
  "delivery_in_progress",
];

function classifyJob(job: Job, execState: ExecutableEvaluation): ExecutionClass {
  // Terminal
  if ((TERMINAL_STATUSES as string[]).includes(job.status)) {
    return "terminal";
  }

  // Currently in-progress
  if (IN_PROGRESS_STATUSES.includes(job.status)) {
    return "current_active";
  }

  // Blocked or review-only → ineligible
  if (execState.state === "blocked" || execState.state === "review_only") {
    return "assigned_but_ineligible";
  }

  // Executable: check timing
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const hasTodayTiming =
    (job.pickup_time_from && job.job_date && job.job_date <= todayStr) ||
    (job.earliest_delivery_date && job.earliest_delivery_date <= todayStr) ||
    (job.job_date && job.job_date <= todayStr);

  if (hasTodayTiming) {
    return "eligible_due_now";
  }

  return "eligible_due_later";
}

// ── Ranked Job ───────────────────────────────────────────────────────

export interface RankedJob extends Job {
  execution_rank: number;
  execution_class: ExecutionClass;
  execution_reason: string;
  executable_state: ExecutableState;
  is_next_recommended: boolean;
}

// ── Execution Reason ─────────────────────────────────────────────────

function executionReason(cls: ExecutionClass, job: Job, execEval: ExecutableEvaluation): string {
  switch (cls) {
    case "current_active":
      return "Current active job";
    case "eligible_due_now":
      if (job.pickup_time_from) return `Pickup from ${job.pickup_time_from}`;
      if (job.earliest_delivery_date) return `Deliver by ${job.earliest_delivery_date}`;
      return "Due today";
    case "eligible_due_later":
      return "Next recommended";
    case "assigned_but_ineligible":
      return execEval.reason || "Not yet eligible";
    case "terminal":
      return "Completed";
  }
}

// ── Stage B: Deterministic sort within class ─────────────────────────

function withinClassSort(a: RankedJob, b: RankedJob, lastDeliveryPostcode: string | null): number {
  // 1. Workflow continuation: in_transit > pickup_complete > others
  const workflowPriority: Record<string, number> = {
    pickup_in_progress: 1,
    delivery_in_progress: 1,
    in_transit: 2,
    pickup_complete: 3,
    ready_for_pickup: 5,
    assigned: 5,
    new: 6,
  };
  const aPrio = workflowPriority[a.status] ?? 10;
  const bPrio = workflowPriority[b.status] ?? 10;
  if (aPrio !== bPrio) return aPrio - bPrio;

  // 2. Hard timing constraints (pickup_time_from)
  if (a.pickup_time_from && b.pickup_time_from) {
    const cmp = a.pickup_time_from.localeCompare(b.pickup_time_from);
    if (cmp !== 0) return cmp;
  }
  if (a.pickup_time_from && !b.pickup_time_from) return -1;
  if (!a.pickup_time_from && b.pickup_time_from) return 1;

  // 3. Route adjacency — postcode prefix match with last delivery
  if (lastDeliveryPostcode) {
    const aMatch = a.pickup_postcode?.slice(0, 3) === lastDeliveryPostcode;
    const bMatch = b.pickup_postcode?.slice(0, 3) === lastDeliveryPostcode;
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
  }

  // 4. job_date
  if (a.job_date && b.job_date) {
    const cmp = a.job_date.localeCompare(b.job_date);
    if (cmp !== 0) return cmp;
  }
  if (a.job_date && !b.job_date) return -1;
  if (!a.job_date && b.job_date) return 1;

  // 5. created_at (stable tie-break)
  return a.created_at.localeCompare(b.created_at);
}

// ── Main rankJobs ────────────────────────────────────────────────────

export function rankJobs(jobs: Job[]): RankedJob[] {
  // Stage A: classify
  const classified: RankedJob[] = jobs.map(job => {
    const execEval = evaluateExecutableState(job, jobs);
    const cls = classifyJob(job, execEval);
    return {
      ...job,
      execution_class: cls,
      execution_rank: CLASS_RANK[cls],
      execution_reason: executionReason(cls, job, execEval),
      executable_state: execEval.state,
      is_next_recommended: false,
    };
  });

  // Group by class
  const groups = new Map<ExecutionClass, RankedJob[]>();
  for (const j of classified) {
    const list = groups.get(j.execution_class) || [];
    list.push(j);
    groups.set(j.execution_class, list);
  }

  // Stage B: sort within each class
  const result: RankedJob[] = [];
  let lastDeliveryPostcode: string | null = null;

  const classOrder: ExecutionClass[] = [
    "current_active",
    "eligible_due_now",
    "eligible_due_later",
    "assigned_but_ineligible",
    "terminal",
  ];

  for (const cls of classOrder) {
    const group = groups.get(cls);
    if (!group || group.length === 0) continue;

    group.sort((a, b) => withinClassSort(a, b, lastDeliveryPostcode));
    result.push(...group);

    // Track last delivery postcode for route adjacency in next class
    const lastJob = group[group.length - 1];
    if (lastJob.delivery_postcode) {
      lastDeliveryPostcode = lastJob.delivery_postcode.slice(0, 3);
    }
  }

  // Mark exactly one recommended target (first executable non-terminal)
  const recommended = result.find(
    r => r.executable_state === "executable" && r.execution_class !== "terminal"
  );
  if (recommended) {
    recommended.is_next_recommended = true;
  }

  return result;
}
