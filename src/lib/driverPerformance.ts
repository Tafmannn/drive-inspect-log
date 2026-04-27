/**
 * driverPerformance — Stage 7 driver intelligence layer.
 *
 * Pure functions. Aggregates per-driver operational metrics from existing
 * job/inspection/photo/upload data using the same shared intelligence
 * primitives already in use elsewhere (evidenceHealth, invoiceReadiness,
 * statusConfig). No new business semantics — this is an aggregation /
 * presentation layer only.
 *
 * Privacy: this module produces metrics ONLY. It is the caller's
 * responsibility to ensure non-admin users never receive other drivers'
 * rows. See `useDriverPerformance` (admin-only) and the route guards in
 * AdminDrivers.tsx.
 */

import {
  ACTIVE_STATUSES,
  PENDING_STATUSES,
  TERMINAL_STATUSES,
  JOB_STATUS,
  type JobStatusValue,
} from "./statusConfig";
import {
  evaluateEvidenceHealth,
  type EvidenceHealthLevel,
  type EvidenceHealthResult,
} from "./evidenceHealth";
import type { Inspection, Photo } from "./types";

/* ─── Inputs ─────────────────────────────────────────────────────── */

export interface DriverPerfJob {
  id: string;
  driver_id: string | null;
  status: string;
  total_price?: number | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Optional planned pickup window for late-pickup detection. */
  pickup_time_to?: string | null;
  /** Optional planned delivery window for late-delivery detection. */
  delivery_time_to?: string | null;
  /** ISO timestamp of first pickup inspection (when known). */
  pickup_inspected_at?: string | null;
  /** ISO timestamp of delivery inspection (when known). */
  delivery_inspected_at?: string | null;
  /** True if invoice_items already references this job. */
  is_invoiced?: boolean;
  /** Number of failed-state pending uploads attached to this job. */
  failed_upload_count?: number;
  /** Whether driver/customer signatures are present (any inspection). */
  has_driver_signature?: boolean;
  has_customer_signature?: boolean;
  /** Optional precomputed evidence health (else computed from photos/inspections). */
  evidenceHealth?: EvidenceHealthResult | null;
  /** Optional photos/inspections for on-the-fly evidence eval. */
  photos?: Photo[];
  inspections?: Inspection[];
}

/* ─── Outputs ────────────────────────────────────────────────────── */

export type DriverRiskLevel = "low" | "medium" | "high";

export interface DriverPerformance {
  driverId: string;
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  cancelledJobs: number;

  latePickupCount: number;
  lateDeliveryCount: number;

  failedUploadCount: number;
  missingSignatureCount: number;

  evidenceHealthDistribution: Record<EvidenceHealthLevel, number>;
  averageEvidenceScore: number; // 0..1 where 1=green

  podRejectionCount: number;
  adminInterventionCount: number;

  completionRate: number; // completed / (completed+cancelled), 0..1
  riskLevel: DriverRiskLevel;
  riskReasons: string[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */

const HEALTH_SCORE: Record<EvidenceHealthLevel, number> = {
  green: 1,
  amber: 0.66,
  red: 0.2,
  critical: 0,
};

function isLate(plannedTo: string | null | undefined, actualAt: string | null | undefined): boolean {
  if (!plannedTo || !actualAt) return false;
  // plannedTo may be HH:MM or ISO; we compare timestamps where possible.
  const planned = Date.parse(plannedTo);
  const actual = Date.parse(actualAt);
  if (Number.isNaN(planned) || Number.isNaN(actual)) return false;
  return actual > planned;
}

function jobEvidence(job: DriverPerfJob): EvidenceHealthResult | null {
  if (job.evidenceHealth) return job.evidenceHealth;
  if (!job.photos && !job.inspections) return null;
  return evaluateEvidenceHealth({
    photos: job.photos ?? [],
    inspections: job.inspections ?? [],
    currentRunId: null,
  });
}

/* ─── Core ───────────────────────────────────────────────────────── */

export function calculateDriverPerformance(
  driverId: string,
  jobs: DriverPerfJob[],
): DriverPerformance {
  const mine = jobs.filter((j) => j.driver_id === driverId);

  const activeSet = new Set<string>(ACTIVE_STATUSES.concat(PENDING_STATUSES) as string[]);
  const terminalSet = new Set<string>(TERMINAL_STATUSES as string[]);

  let activeJobs = 0;
  let completedJobs = 0;
  let cancelledJobs = 0;
  let latePickupCount = 0;
  let lateDeliveryCount = 0;
  let failedUploadCount = 0;
  let missingSignatureCount = 0;
  let podRejectionCount = 0;
  let adminInterventionCount = 0;

  const dist: Record<EvidenceHealthLevel, number> = {
    green: 0, amber: 0, red: 0, critical: 0,
  };
  let healthEvaluatedCount = 0;
  let healthScoreSum = 0;

  for (const j of mine) {
    if (j.status === JOB_STATUS.COMPLETED) completedJobs += 1;
    else if (j.status === JOB_STATUS.CANCELLED || j.status === JOB_STATUS.FAILED) cancelledJobs += 1;
    else if (activeSet.has(j.status)) activeJobs += 1;

    if (isLate(j.pickup_time_to, j.pickup_inspected_at)) latePickupCount += 1;
    if (isLate(j.delivery_time_to, j.delivery_inspected_at)) lateDeliveryCount += 1;

    failedUploadCount += j.failed_upload_count ?? 0;

    // Only count missing signatures on jobs that should have completed delivery.
    const requiresSignatures =
      j.status === JOB_STATUS.POD_READY ||
      j.status === JOB_STATUS.DELIVERY_COMPLETE ||
      j.status === JOB_STATUS.COMPLETED;
    if (requiresSignatures) {
      if (!j.has_driver_signature) missingSignatureCount += 1;
      if (!j.has_customer_signature) missingSignatureCount += 1;
    }

    const ev = jobEvidence(j);
    if (ev) {
      dist[ev.level] += 1;
      healthScoreSum += HEALTH_SCORE[ev.level];
      healthEvaluatedCount += 1;
      if (ev.level === "red" || ev.level === "critical") {
        if (terminalSet.has(j.status)) podRejectionCount += 1;
        adminInterventionCount += 1;
      }
    }
  }

  const finishedTotal = completedJobs + cancelledJobs;
  const completionRate = finishedTotal === 0 ? 1 : completedJobs / finishedTotal;
  const averageEvidenceScore =
    healthEvaluatedCount === 0 ? 1 : healthScoreSum / healthEvaluatedCount;

  // ─ Risk model ─
  const reasons: string[] = [];
  if (failedUploadCount >= 3) reasons.push(`${failedUploadCount} failed uploads`);
  if (missingSignatureCount >= 2) reasons.push(`${missingSignatureCount} missing signatures`);
  if (podRejectionCount >= 1) reasons.push(`${podRejectionCount} POD rejections`);
  if (latePickupCount + lateDeliveryCount >= 3) {
    reasons.push(`${latePickupCount + lateDeliveryCount} late events`);
  }
  if (averageEvidenceScore < 0.5 && healthEvaluatedCount > 0) {
    reasons.push("Low average evidence quality");
  }
  if (completionRate < 0.7 && finishedTotal >= 3) {
    reasons.push(`${Math.round(completionRate * 100)}% completion rate`);
  }

  const highRisk =
    podRejectionCount >= 2 ||
    failedUploadCount >= 5 ||
    (averageEvidenceScore < 0.4 && healthEvaluatedCount >= 3) ||
    (completionRate < 0.5 && finishedTotal >= 3);

  const mediumRisk = reasons.length > 0;

  const riskLevel: DriverRiskLevel = highRisk ? "high" : mediumRisk ? "medium" : "low";

  return {
    driverId,
    totalJobs: mine.length,
    activeJobs,
    completedJobs,
    cancelledJobs,
    latePickupCount,
    lateDeliveryCount,
    failedUploadCount,
    missingSignatureCount,
    evidenceHealthDistribution: dist,
    averageEvidenceScore,
    podRejectionCount,
    adminInterventionCount,
    completionRate,
    riskLevel,
    riskReasons: reasons,
  };
}

/**
 * Compute performance for many drivers from a shared job list.
 */
export function calculateAllDriverPerformance(
  driverIds: string[],
  jobs: DriverPerfJob[],
): Record<string, DriverPerformance> {
  const out: Record<string, DriverPerformance> = {};
  for (const id of driverIds) {
    out[id] = calculateDriverPerformance(id, jobs);
  }
  return out;
}

/** Convenience: empty/zeroed performance row (for drivers with no jobs). */
export function emptyDriverPerformance(driverId: string): DriverPerformance {
  return calculateDriverPerformance(driverId, []);
}

export const __test_helpers__ = { isLate };

/* eslint-disable @typescript-eslint/no-unused-vars */
type _StatusGuard = JobStatusValue;
