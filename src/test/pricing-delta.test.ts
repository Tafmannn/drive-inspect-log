import { describe, it, expect } from "vitest";
import { computePriceDelta } from "@/lib/pricingDelta";

describe("computePriceDelta", () => {
  it("returns 'unknown' when suggestion is null", () => {
    const d = computePriceDelta(100, null);
    expect(d.severity).toBe("unknown");
    expect(d.direction).toBe("unknown");
    expect(d.warn).toBe(false);
  });

  it("returns 'unknown' when current price is missing/zero (no comparison)", () => {
    const d1 = computePriceDelta(null, 200);
    const d2 = computePriceDelta(0, 200);
    expect(d1.severity).toBe("unknown");
    expect(d2.severity).toBe("unknown");
    expect(d1.percent).toBeNull();
    expect(d1.label).toContain("£200.00");
  });

  it("classifies <5% as 'none' (no warning)", () => {
    const d = computePriceDelta(100, 103);
    expect(d.severity).toBe("none");
    expect(d.direction).toBe("higher");
    expect(d.warn).toBe(false);
  });

  it("classifies 5–15% as 'minor' (no warning)", () => {
    const d = computePriceDelta(100, 110);
    expect(d.severity).toBe("minor");
    expect(d.warn).toBe(false);
    expect(d.percent).toBe(10);
  });

  it("classifies 15–30% as 'notable' (warns)", () => {
    const d = computePriceDelta(100, 120);
    expect(d.severity).toBe("notable");
    expect(d.warn).toBe(true);
    expect(d.direction).toBe("higher");
    expect(d.label).toContain("higher");
  });

  it("classifies ≥30% as 'major' (warns)", () => {
    const d = computePriceDelta(100, 200);
    expect(d.severity).toBe("major");
    expect(d.warn).toBe(true);
    expect(d.percent).toBe(100);
  });

  it("detects 'lower' direction with negative absolute", () => {
    const d = computePriceDelta(200, 100);
    expect(d.direction).toBe("lower");
    expect(d.absolute).toBe(-100);
    expect(d.severity).toBe("major");
    expect(d.label).toContain("lower");
  });

  it("recognises an exact match as 'equal'", () => {
    const d = computePriceDelta(150, 150);
    expect(d.direction).toBe("equal");
    expect(d.label).toBe("Matches current price");
    expect(d.warn).toBe(false);
  });

  it("rounds absolute and percent to 2dp / nearest int respectively", () => {
    const d = computePriceDelta(100, 117.333);
    expect(d.absolute).toBe(17.33);
    expect(d.percent).toBe(17.33);
    expect(d.label).toContain("17%");
  });
});
