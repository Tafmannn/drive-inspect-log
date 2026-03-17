/**
 * Phase 3 — Execution Discipline: Deterministic job ranking for My Jobs.
 *
 * Ranking order:
 *   1. Current in-progress job
 *   2. Blocked-if-not-done-next (timing constrained, earliest first)
 *   3. Earliest executable timing-constrained job
 *   4. Best next ready job (by date, then creation)
 *   5. Geographically sensible (deterministic heuristic: postcode prefix match)
 *   6. Remaining assigned jobs
 *   7. Completed/recent last or excluded
 */

import type { Job } from "./types";
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "./statusConfig";

export interface RankedJob extends Job {
  execution_rank: number;
  execution_reason: string;
  is_next_recommended: boolean;
}

const IN_PROGRESS_STATUSES = [
  "pickup_in_progress",
  "delivery_in_progress",
];

const TIMING_STATUSES = ACTIVE_STATUSES;

export function rankJobs(jobs: Job[]): RankedJob[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Separate terminal jobs
  const active: Job[] = [];
  const terminal: Job[] = [];

  for (const j of jobs) {
    if ((TERMINAL_STATUSES as string[]).includes(j.status)) {
      terminal.push(j);
    } else {
      active.push(j);
    }
  }

  const ranked: RankedJob[] = [];
  const used = new Set<string>();

  // Rank 1: Current in-progress
  for (const j of active) {
    if (IN_PROGRESS_STATUSES.includes(j.status)) {
      ranked.push({ ...j, execution_rank: 1, execution_reason: "Current active job", is_next_recommended: true });
      used.add(j.id);
    }
  }

  // Rank 2: Blocked-if-not-done-next — jobs with earliest_delivery_date = today and haven't started
  for (const j of active) {
    if (used.has(j.id)) continue;
    if (j.earliest_delivery_date && j.earliest_delivery_date <= todayStr && !j.has_pickup_inspection) {
      ranked.push({ ...j, execution_rank: 2, execution_reason: "Restricted until later", is_next_recommended: ranked.length === 0 });
      used.add(j.id);
    }
  }

  // Rank 3: Earliest executable timing-constrained
  const timingJobs = active
    .filter(j => !used.has(j.id) && j.pickup_time_from && (TIMING_STATUSES as string[]).includes(j.status))
    .sort((a, b) => (a.pickup_time_from ?? "").localeCompare(b.pickup_time_from ?? ""));

  for (const j of timingJobs) {
    ranked.push({ ...j, execution_rank: 3, execution_reason: `Pickup from ${j.pickup_time_from}`, is_next_recommended: ranked.length === 0 });
    used.add(j.id);
  }

  // Rank 4: Best next ready job (by job_date then created_at)
  const readyJobs = active
    .filter(j => !used.has(j.id) && (ACTIVE_STATUSES as string[]).includes(j.status))
    .sort((a, b) => {
      if (a.job_date && b.job_date) return a.job_date.localeCompare(b.job_date);
      if (a.job_date) return -1;
      if (b.job_date) return 1;
      return a.created_at.localeCompare(b.created_at);
    });

  // Rank 5: Geographic heuristic — match postcode prefix with last ranked delivery postcode
  const lastDeliveryPostcode = ranked.length > 0 ? ranked[ranked.length - 1].delivery_postcode?.slice(0, 3) : null;

  if (lastDeliveryPostcode) {
    const geoMatch = readyJobs.filter(j => j.pickup_postcode?.slice(0, 3) === lastDeliveryPostcode);
    for (const j of geoMatch) {
      if (used.has(j.id)) continue;
      ranked.push({ ...j, execution_rank: 5, execution_reason: "Best next route match", is_next_recommended: ranked.length === 0 });
      used.add(j.id);
    }
  }

  // Remaining ready jobs as rank 4
  for (const j of readyJobs) {
    if (used.has(j.id)) continue;
    ranked.push({ ...j, execution_rank: 4, execution_reason: "Next recommended", is_next_recommended: ranked.length === 0 });
    used.add(j.id);
  }

  // Rank 6: Remaining assigned active jobs
  for (const j of active) {
    if (used.has(j.id)) continue;
    ranked.push({ ...j, execution_rank: 6, execution_reason: "Assigned", is_next_recommended: false });
    used.add(j.id);
  }

  // Rank 7: Terminal jobs (excluded from recommendations)
  for (const j of terminal) {
    ranked.push({ ...j, execution_rank: 7, execution_reason: "Completed", is_next_recommended: false });
  }

  // Ensure first non-completed item is recommended if none yet
  const hasRecommended = ranked.some(r => r.is_next_recommended);
  if (!hasRecommended && ranked.length > 0) {
    const first = ranked.find(r => r.execution_rank < 7);
    if (first) first.is_next_recommended = true;
  }

  return ranked;
}
