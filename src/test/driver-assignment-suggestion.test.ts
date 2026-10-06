import { describe, it, expect } from "vitest";
import { rankDriverCandidates } from "@/lib/driverAssignmentSuggestion";

describe("rankDriverCandidates", () => {
  it("sorts known distances nearest-first", () => {
    const r = rankDriverCandidates([
      { driverId: "far", distanceMiles: 50, maxDailyDistanceMiles: null },
      { driverId: "near", distanceMiles: 5, maxDailyDistanceMiles: null },
      { driverId: "mid", distanceMiles: 20, maxDailyDistanceMiles: null },
    ]);
    expect(r.map((c) => c.driverId)).toEqual(["near", "mid", "far"]);
  });

  it("puts unknown-distance drivers after known-distance drivers", () => {
    const r = rankDriverCandidates([
      { driverId: "unknown", distanceMiles: null, maxDailyDistanceMiles: null },
      { driverId: "known", distanceMiles: 10, maxDailyDistanceMiles: null },
    ]);
    expect(r.map((c) => c.driverId)).toEqual(["known", "unknown"]);
  });

  it("flags a driver outside their own stated max_daily_distance as outsideRange, not excluded", () => {
    const r = rankDriverCandidates([
      { driverId: "overLimit", distanceMiles: 100, maxDailyDistanceMiles: 50 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].outsideRange).toBe(true);
  });

  it("pushes out-of-range drivers after in-range drivers, even if nominally nearer", () => {
    const r = rankDriverCandidates([
      { driverId: "nearButOverLimit", distanceMiles: 10, maxDailyDistanceMiles: 5 },
      { driverId: "fartherButInRange", distanceMiles: 30, maxDailyDistanceMiles: 100 },
    ]);
    expect(r.map((c) => c.driverId)).toEqual(["fartherButInRange", "nearButOverLimit"]);
  });

  it("does not flag outsideRange when the driver has no stated max_daily_distance", () => {
    const r = rankDriverCandidates([
      { driverId: "noLimit", distanceMiles: 500, maxDailyDistanceMiles: null },
    ]);
    expect(r[0].outsideRange).toBe(false);
  });

  it("never drops a candidate — same length in, same length out", () => {
    const input = [
      { driverId: "a", distanceMiles: null, maxDailyDistanceMiles: null },
      { driverId: "b", distanceMiles: 5, maxDailyDistanceMiles: 1 },
      { driverId: "c", distanceMiles: 5, maxDailyDistanceMiles: 10 },
    ];
    expect(rankDriverCandidates(input)).toHaveLength(3);
  });
});
