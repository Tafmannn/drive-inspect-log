import { describe, it, expect } from "vitest";
import { computeJobMargin } from "@/features/control/hooks/useControlProfitabilityData";

describe("computeJobMargin — pure margin derivation", () => {
  it("computes margin from logged expenses alone when no driver pay rate is set", () => {
    const r = computeJobMargin({
      totalPrice: 200,
      routeDistanceMiles: 50,
      loggedExpenses: 30,
      driverPayRate: null,
      driverPayBasis: null,
    });
    expect(r.revenue).toBe(200);
    expect(r.driverCost).toBeNull();
    expect(r.cost).toBe(30);
    expect(r.margin).toBe(170);
    expect(r.marginPct).toBe(85);
    expect(r.costIncomplete).toBe(true);
  });

  it("includes a flat per-job driver rate in cost and marks cost complete", () => {
    const r = computeJobMargin({
      totalPrice: 200,
      routeDistanceMiles: 50,
      loggedExpenses: 30,
      driverPayRate: 60,
      driverPayBasis: "per_job",
    });
    expect(r.driverCost).toBe(60);
    expect(r.cost).toBe(90);
    expect(r.margin).toBe(110);
    expect(r.costIncomplete).toBe(false);
  });

  it("multiplies a per-mile rate by route distance", () => {
    const r = computeJobMargin({
      totalPrice: 200,
      routeDistanceMiles: 50,
      loggedExpenses: 10,
      driverPayRate: 0.5,
      driverPayBasis: "per_mile",
    });
    expect(r.driverCost).toBe(25);
    expect(r.cost).toBe(35);
    expect(r.margin).toBe(165);
    expect(r.costIncomplete).toBe(false);
  });

  it("treats a per-mile job with no recorded distance as incomplete, never zero cost", () => {
    const r = computeJobMargin({
      totalPrice: 200,
      routeDistanceMiles: null,
      loggedExpenses: 10,
      driverPayRate: 0.5,
      driverPayBasis: "per_mile",
    });
    expect(r.driverCost).toBeNull();
    expect(r.cost).toBe(10);
    expect(r.costIncomplete).toBe(true);
  });

  it("treats an hourly basis as not yet computable, never zero cost", () => {
    const r = computeJobMargin({
      totalPrice: 200,
      routeDistanceMiles: 50,
      loggedExpenses: 10,
      driverPayRate: 15,
      driverPayBasis: "hourly",
    });
    expect(r.driverCost).toBeNull();
    expect(r.costIncomplete).toBe(true);
  });

  it("never divides by zero revenue — marginPct is null, not Infinity or NaN", () => {
    const r = computeJobMargin({
      totalPrice: 0,
      routeDistanceMiles: 10,
      loggedExpenses: 20,
      driverPayRate: null,
      driverPayBasis: null,
    });
    expect(r.marginPct).toBeNull();
    expect(r.margin).toBe(-20);
  });

  it("treats a missing total_price as zero revenue, not a crash", () => {
    const r = computeJobMargin({
      totalPrice: null,
      routeDistanceMiles: 10,
      loggedExpenses: 15,
      driverPayRate: null,
      driverPayBasis: null,
    });
    expect(r.revenue).toBe(0);
    expect(r.margin).toBe(-15);
  });

  it("a negative margin is reported as negative, not clamped to zero", () => {
    const r = computeJobMargin({
      totalPrice: 50,
      routeDistanceMiles: 100,
      loggedExpenses: 20,
      driverPayRate: 1,
      driverPayBasis: "per_mile",
    });
    expect(r.driverCost).toBe(100);
    expect(r.cost).toBe(120);
    expect(r.margin).toBe(-70);
    expect(r.marginPct).toBe(-140);
  });
});
