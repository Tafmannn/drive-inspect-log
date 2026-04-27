import { describe, it, expect } from "vitest";
import {
  calculateDriverPerformance,
  calculateAllDriverPerformance,
  emptyDriverPerformance,
  type DriverPerfJob,
} from "@/lib/driverPerformance";
import type { EvidenceHealthResult } from "@/lib/evidenceHealth";

const ev = (level: EvidenceHealthResult["level"]): EvidenceHealthResult => ({
  level,
  canUseForPod: level === "green" || level === "amber",
  canInvoice: level === "green" || level === "amber",
  blockers: [],
  warnings: [],
  photos: {
    totalRaw: 0, totalDeduped: 0, pickupCount: 0, deliveryCount: 0,
    legacyCount: 0, staleRunCount: 0, archivedCount: 0, missingUrlCount: 0, duplicateCount: 0,
  } as any,
  inspections: { hasPickup: true, hasDelivery: true, hasDriverSignature: true, hasCustomerSignature: true } as any,
});

const baseJob = (over: Partial<DriverPerfJob>): DriverPerfJob => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  driver_id: "d1",
  status: "completed",
  ...over,
});

describe("driverPerformance — counts and aggregates", () => {
  it("returns empty performance for driver with no jobs", () => {
    const p = emptyDriverPerformance("d1");
    expect(p.totalJobs).toBe(0);
    expect(p.completionRate).toBe(1);
    expect(p.riskLevel).toBe("low");
  });

  it("counts active, completed, and cancelled jobs separately", () => {
    const jobs: DriverPerfJob[] = [
      baseJob({ status: "in_transit" }),
      baseJob({ status: "pickup_complete" }),
      baseJob({ status: "completed" }),
      baseJob({ status: "completed" }),
      baseJob({ status: "cancelled" }),
    ];
    const p = calculateDriverPerformance("d1", jobs);
    expect(p.totalJobs).toBe(5);
    expect(p.activeJobs).toBe(2);
    expect(p.completedJobs).toBe(2);
    expect(p.cancelledJobs).toBe(1);
  });

  it("ignores jobs from other drivers", () => {
    const jobs: DriverPerfJob[] = [
      baseJob({ driver_id: "d1", status: "completed" }),
      baseJob({ driver_id: "d2", status: "completed" }),
      baseJob({ driver_id: null, status: "completed" }),
    ];
    expect(calculateDriverPerformance("d1", jobs).totalJobs).toBe(1);
    expect(calculateDriverPerformance("d2", jobs).totalJobs).toBe(1);
  });

  it("computes completion rate from completed/(completed+cancelled)", () => {
    const jobs: DriverPerfJob[] = [
      baseJob({ status: "completed" }),
      baseJob({ status: "completed" }),
      baseJob({ status: "completed" }),
      baseJob({ status: "cancelled" }),
    ];
    const p = calculateDriverPerformance("d1", jobs);
    expect(p.completionRate).toBeCloseTo(0.75);
  });
});

describe("driverPerformance — late events", () => {
  it("flags late pickup when actual > planned", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({
        pickup_time_to: "2026-01-01T10:00:00Z",
        pickup_inspected_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    expect(p.latePickupCount).toBe(1);
  });

  it("does not flag on-time pickup", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({
        pickup_time_to: "2026-01-01T10:00:00Z",
        pickup_inspected_at: "2026-01-01T09:30:00Z",
      }),
    ]);
    expect(p.latePickupCount).toBe(0);
  });

  it("ignores when planned/actual missing", () => {
    const p = calculateDriverPerformance("d1", [baseJob({})]);
    expect(p.latePickupCount).toBe(0);
    expect(p.lateDeliveryCount).toBe(0);
  });
});

describe("driverPerformance — uploads and signatures", () => {
  it("sums failed upload counts", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ failed_upload_count: 2 }),
      baseJob({ failed_upload_count: 3 }),
    ]);
    expect(p.failedUploadCount).toBe(5);
  });

  it("counts missing signatures only on jobs that should have them", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ status: "ready_for_pickup", has_driver_signature: false, has_customer_signature: false }),
      baseJob({ status: "completed", has_driver_signature: false, has_customer_signature: true }),
      baseJob({ status: "pod_ready", has_driver_signature: true, has_customer_signature: false }),
    ]);
    // ready_for_pickup ignored; other two each contribute 1.
    expect(p.missingSignatureCount).toBe(2);
  });
});

describe("driverPerformance — evidence health aggregation", () => {
  it("uses provided evidenceHealth and computes distribution + average", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ evidenceHealth: ev("green") }),
      baseJob({ evidenceHealth: ev("amber") }),
      baseJob({ evidenceHealth: ev("red") }),
    ]);
    expect(p.evidenceHealthDistribution.green).toBe(1);
    expect(p.evidenceHealthDistribution.amber).toBe(1);
    expect(p.evidenceHealthDistribution.red).toBe(1);
    expect(p.averageEvidenceScore).toBeGreaterThan(0);
    expect(p.averageEvidenceScore).toBeLessThan(1);
  });

  it("counts red/critical evidence on terminal jobs as POD rejections", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ status: "completed", evidenceHealth: ev("red") }),
      baseJob({ status: "completed", evidenceHealth: ev("critical") }),
      baseJob({ status: "in_transit", evidenceHealth: ev("red") }), // not terminal
    ]);
    expect(p.podRejectionCount).toBe(2);
    expect(p.adminInterventionCount).toBe(3);
  });
});

describe("driverPerformance — risk model", () => {
  it("clean driver returns low risk and no reasons", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ status: "completed", evidenceHealth: ev("green"), has_driver_signature: true, has_customer_signature: true }),
    ]);
    expect(p.riskLevel).toBe("low");
    expect(p.riskReasons).toHaveLength(0);
  });

  it("escalates to high on multiple POD rejections", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ status: "completed", evidenceHealth: ev("critical") }),
      baseJob({ status: "completed", evidenceHealth: ev("critical") }),
    ]);
    expect(p.riskLevel).toBe("high");
    expect(p.riskReasons.join(" ")).toMatch(/POD/);
  });

  it("escalates to high on excessive failed uploads", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ failed_upload_count: 6 }),
    ]);
    expect(p.riskLevel).toBe("high");
  });

  it("medium risk on a single POD rejection", () => {
    const p = calculateDriverPerformance("d1", [
      baseJob({ status: "completed", evidenceHealth: ev("red") }),
    ]);
    expect(p.riskLevel).toBe("medium");
  });
});

describe("driverPerformance — privacy / multi-driver", () => {
  it("calculateAllDriverPerformance keeps each driver's data isolated", () => {
    const jobs: DriverPerfJob[] = [
      baseJob({ driver_id: "alice", status: "completed", evidenceHealth: ev("green") }),
      baseJob({ driver_id: "bob", status: "completed", evidenceHealth: ev("critical") }),
      baseJob({ driver_id: "bob", status: "completed", evidenceHealth: ev("critical") }),
    ];
    const all = calculateAllDriverPerformance(["alice", "bob"], jobs);
    expect(all.alice.podRejectionCount).toBe(0);
    expect(all.alice.riskLevel).toBe("low");
    expect(all.bob.podRejectionCount).toBe(2);
    expect(all.bob.riskLevel).toBe("high");
    // alice metrics do not leak bob's totals
    expect(all.alice.totalJobs).toBe(1);
    expect(all.bob.totalJobs).toBe(2);
  });
});
