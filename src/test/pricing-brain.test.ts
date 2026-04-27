import { describe, it, expect } from "vitest";
import { suggestJobPrice, PRICING_DEFAULTS } from "@/lib/pricingBrain";

describe("pricingBrain — admin override", () => {
  it("preserves admin-entered price verbatim", () => {
    const r = suggestJobPrice({ adminOverridePrice: 175, routeMiles: 50 });
    expect(r.suggestedPrice).toBe(175);
    expect(r.confidence).toBe("high");
    expect(r.reasons.join(" ")).toMatch(/preserved/i);
    expect(r.isFinalInvoicePrice).toBe(false);
  });

  it("admin override wins even when miles missing", () => {
    const r = suggestJobPrice({ adminOverridePrice: 99 });
    expect(r.suggestedPrice).toBe(99);
    expect(r.missingInputs).toHaveLength(0);
  });
});

describe("pricingBrain — minimum charge", () => {
  it("short job is floored to minimum charge", () => {
    const r = suggestJobPrice({ routeMiles: 5, ratePerMile: 1.2, minimumCharge: 50 });
    expect(r.suggestedPrice).toBe(50);
    expect(r.reasons.join(" ")).toMatch(/minimum charge/i);
    expect(r.confidence).toBe("low"); // short band
  });

  it("uses default minimum charge when not provided", () => {
    const r = suggestJobPrice({ routeMiles: 1 });
    expect(r.suggestedPrice).toBe(PRICING_DEFAULTS.MIN_CHARGE);
  });
});

describe("pricingBrain — distance-based suggestion", () => {
  it("computes long job from miles × rate", () => {
    const r = suggestJobPrice({
      routeMiles: 100,
      ratePerMile: 1.5,
      fuelEstimate: 20,
      returnTravelEstimate: 15,
      cazRisk: { zoneCount: 0, estimatedCost: 0 },
    });
    // 100 * 1.5 = 150 + 20 + 15 = 185
    expect(r.suggestedPrice).toBe(185);
    expect(r.confidence).toBe("medium");
    expect(r.breakdown.distance).toBe(150);
    expect(r.breakdown.fuel).toBe(20);
  });

  it("applies urgency multiplier", () => {
    const r = suggestJobPrice({
      routeMiles: 100,
      ratePerMile: 1.5,
      urgency: "urgent",
      fuelEstimate: 0.01,
      returnTravelEstimate: 0.01,
      cazRisk: { zoneCount: 0, estimatedCost: 0 },
    });
    // 100*1.5 ≈ 150 * 1.3 ≈ 195
    expect(r.suggestedPrice).toBeGreaterThan(190);
    expect(r.breakdown.urgencyMultiplier).toBe(1.3);
  });
});

describe("pricingBrain — missing inputs", () => {
  it("returns missing input warning when miles absent", () => {
    const r = suggestJobPrice({});
    expect(r.suggestedPrice).toBeNull();
    expect(r.missingInputs).toContain("route_miles");
    expect(r.warnings.join(" ")).toMatch(/Route distance unavailable/i);
  });

  it("flags missing CAZ data without guessing", () => {
    const r = suggestJobPrice({ routeMiles: 100, ratePerMile: 1.5 });
    expect(r.missingInputs).toContain("caz_risk");
    expect(r.breakdown.caz).toBeUndefined();
  });

  it("warns about CAZ exposure on long routes when unknown", () => {
    const r = suggestJobPrice({ routeMiles: 150, ratePerMile: 1.5 });
    expect(r.warnings.some(w => /CAZ/i.test(w))).toBe(true);
  });
});

describe("pricingBrain — client rate card", () => {
  it("flat agreedPrice short-circuits with floor", () => {
    const r = suggestJobPrice({
      routeMiles: 200,
      clientRateCard: { agreedPrice: 30, minimumCharge: 50 },
    });
    expect(r.suggestedPrice).toBe(50);
    expect(r.reasons.join(" ")).toMatch(/Floored/);
  });

  it("client per-mile rate overrides org rate", () => {
    const r = suggestJobPrice({
      routeMiles: 100,
      ratePerMile: 1.0,
      clientRateCard: { ratePerMile: 2.0 },
      fuelEstimate: 0.01,
      returnTravelEstimate: 0.01,
      cazRisk: { zoneCount: 0, estimatedCost: 0 },
    });
    expect(r.suggestedPrice).toBeGreaterThanOrEqual(200);
    expect(r.reasons.join(" ")).toMatch(/Client rate/);
  });
});

describe("pricingBrain — invariants", () => {
  it("suggestion is never marked as final invoice price", () => {
    const cases = [
      suggestJobPrice({ adminOverridePrice: 100 }),
      suggestJobPrice({ routeMiles: 50 }),
      suggestJobPrice({}),
    ];
    for (const c of cases) {
      expect(c.isFinalInvoicePrice).toBe(false);
    }
  });

  it("never returns a negative price", () => {
    const r = suggestJobPrice({ routeMiles: 0.0001, ratePerMile: 0.0001 });
    expect((r.suggestedPrice ?? 0) >= 0).toBe(true);
  });
});
