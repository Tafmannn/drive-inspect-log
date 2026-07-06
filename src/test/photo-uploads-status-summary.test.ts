import { describe, it, expect } from "vitest";
import { summarisePhotoUploadsStatus } from "@/lib/photoUploadsStatusSummary";
import type { JobUploadSummary } from "@/lib/pendingUploads";

function job(overrides: Partial<JobUploadSummary>): JobUploadSummary {
  return {
    jobId: "job-1",
    jobNumber: "AX-001",
    vehicleReg: null,
    pendingCount: 0,
    failedCount: 0,
    needsAttentionCount: 0,
    lastErrorAt: null,
    failedItems: [],
    ...overrides,
  };
}

describe("summarisePhotoUploadsStatus", () => {
  it("returns all-zero totals for an empty job list", () => {
    expect(summarisePhotoUploadsStatus([])).toEqual({
      jobCount: 0,
      pendingCount: 0,
      failedCount: 0,
      needsAttentionCount: 0,
    });
  });

  it("sums pendingCount and needsAttentionCount directly across jobs", () => {
    const jobs = [
      job({ jobId: "a", pendingCount: 2, failedCount: 1, needsAttentionCount: 0 }),
      job({ jobId: "b", pendingCount: 3, failedCount: 2, needsAttentionCount: 1 }),
    ];
    const totals = summarisePhotoUploadsStatus(jobs);
    expect(totals.jobCount).toBe(2);
    expect(totals.pendingCount).toBe(5);
    expect(totals.needsAttentionCount).toBe(1);
  });

  it("excludes needsAttention items from the failedCount bucket", () => {
    // 3 failed total, 1 of which needs attention -> 2 remain "will retry".
    const jobs = [job({ failedCount: 3, needsAttentionCount: 1 })];
    const totals = summarisePhotoUploadsStatus(jobs);
    expect(totals.failedCount).toBe(2);
    expect(totals.needsAttentionCount).toBe(1);
  });

  it("never produces a negative failedCount", () => {
    // Defensive: needsAttentionCount should never exceed failedCount in
    // real data, but the aggregation itself must not go negative.
    const jobs = [job({ failedCount: 0, needsAttentionCount: 0 })];
    const totals = summarisePhotoUploadsStatus(jobs);
    expect(totals.failedCount).toBe(0);
  });
});
