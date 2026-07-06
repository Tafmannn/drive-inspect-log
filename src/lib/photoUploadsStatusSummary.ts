// src/lib/photoUploadsStatusSummary.ts
//
// Pure aggregation for the grouped "Photo uploads" status overview on
// the Pending Uploads screen. Rolls per-job upload summaries up into
// totals by status bucket. No I/O — callers pass in the JobUploadSummary[]
// already loaded by getPendingUploadsByJob().

import type { JobUploadSummary } from "./pendingUploads";

export interface PhotoUploadsStatusTotals {
  jobCount: number;
  pendingCount: number;
  /** Failed items still eligible for auto-retry (excludes needsAttention). */
  failedCount: number;
  needsAttentionCount: number;
}

export function summarisePhotoUploadsStatus(
  jobs: JobUploadSummary[],
): PhotoUploadsStatusTotals {
  let pendingCount = 0;
  let failedCount = 0;
  let needsAttentionCount = 0;

  for (const job of jobs) {
    pendingCount += job.pendingCount;
    needsAttentionCount += job.needsAttentionCount;
    failedCount += job.failedCount - job.needsAttentionCount;
  }

  return {
    jobCount: jobs.length,
    pendingCount,
    failedCount,
    needsAttentionCount,
  };
}
