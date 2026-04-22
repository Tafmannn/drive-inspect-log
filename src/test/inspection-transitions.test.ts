import { describe, it, expect } from "vitest";
import {
  nextStatusForInspection,
  shouldBlockResubmission,
} from "@/lib/inspectionTransitions";
import { JOB_STATUS } from "@/lib/statusConfig";

describe("inspectionTransitions — nextStatusForInspection", () => {
  it("pickup inspection always transitions to PICKUP_COMPLETE", () => {
    expect(nextStatusForInspection("pickup", false)).toBe(JOB_STATUS.PICKUP_COMPLETE);
    expect(nextStatusForInspection("pickup", true)).toBe(JOB_STATUS.PICKUP_COMPLETE);
  });

  it("delivery inspection WITH prior pickup → POD_READY (handover ready for review)", () => {
    expect(nextStatusForInspection("delivery", true)).toBe(JOB_STATUS.POD_READY);
  });

  it("delivery inspection WITHOUT prior pickup → DELIVERY_COMPLETE (incomplete trail)", () => {
    expect(nextStatusForInspection("delivery", false)).toBe(
      JOB_STATUS.DELIVERY_COMPLETE,
    );
  });
});

describe("inspectionTransitions — shouldBlockResubmission", () => {
  it("does not block when no prior inspection exists", () => {
    expect(shouldBlockResubmission(null, JOB_STATUS.PICKUP_IN_PROGRESS)).toBe(false);
    expect(shouldBlockResubmission(undefined, JOB_STATUS.NEW)).toBe(false);
  });

  it("does not block resubmission while pickup is actively in progress", () => {
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.PICKUP_IN_PROGRESS),
    ).toBe(false);
  });

  it("blocks resubmission once pickup inspection is submitted (job moves to PICKUP_COMPLETE or beyond)", () => {
    // Once a driver has submitted and the customer has signed,
    // the inspection record is immutable. Admin must correct via status override.
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.PICKUP_COMPLETE),
    ).toBe(true);
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.IN_TRANSIT),
    ).toBe(true);
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.DELIVERY_IN_PROGRESS),
    ).toBe(true);
  });

  it("blocks resubmission once job has reached POD_READY", () => {
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.POD_READY),
    ).toBe(true);
  });

  it("blocks resubmission once job is COMPLETED or DELIVERY_COMPLETE", () => {
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.COMPLETED),
    ).toBe(true);
    expect(
      shouldBlockResubmission("2025-01-01T00:00:00Z", JOB_STATUS.DELIVERY_COMPLETE),
    ).toBe(true);
  });
});
