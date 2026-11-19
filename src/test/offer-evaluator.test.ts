import { describe, it, expect } from "vitest";
import {
  evaluateOffer,
  evaluateChain,
  policyFromWeeklyTarget,
  type OfferInput,
} from "@/lib/offerEvaluator";

const policy = { targetContributionPerHour: 25, minContributionPerJob: 40 };

// Leeds → collect in Manchester → deliver to Birmingham → train home.
function offer(over: Partial<OfferInput> = {}): OfferInput {
  return {
    ref: "MVX-1",
    offeredPrice: 180,
    startConfirmed: true,
    positioning: { minutes: 90, cost: 25 },
    loaded: { minutes: 120, miles: 90, fuelPaidByClient: true },
    returnLeg: { minutes: 150, cost: 45 },
    inspectionMinutes: 30,
    waitingMinutes: 30,
    ...over,
  };
}

describe("evaluateOffer", () => {
  it("computes contribution, hourly rate, dead time and target price", () => {
    const e = evaluateOffer(offer(), policy);
    // costs 25 + 45 = 70; contribution 110; minutes 90+120+150+30+30 = 420 (7h)
    expect(e.directCosts).toBe(70);
    expect(e.contribution).toBe(110);
    expect(e.totalMinutes).toBe(420);
    expect(e.contributionPerHour).toBe(15.71);
    expect(e.deadTimeShare).toBe(0.57); // 240 / 420
    expect(e.breakEvenPrice).toBe(70);
    expect(e.targetPrice).toBe(245); // 70 + 25 * 7
    expect(e.verdict).toBe("negotiate");
    expect(e.provisional).toBe(false);
  });

  it("accepts when the hourly target is met", () => {
    expect(evaluateOffer(offer({ offeredPrice: 260 }), policy).verdict).toBe("accept");
  });

  it("declines below the per-job minimum contribution", () => {
    const e = evaluateOffer(offer({ offeredPrice: 100 }), policy);
    expect(e.contribution).toBe(30);
    expect(e.verdict).toBe("decline");
  });

  it("applies platform commission to cost and grosses up the target price", () => {
    const e = evaluateOffer(offer({ platformFeeFraction: 0.1 }), policy);
    expect(e.directCosts).toBe(88); // 70 + 18
    expect(e.targetPrice).toBe(273); // (70 + 175) / 0.9 = 272.2 → ceil
  });

  it("counts unrecharged fuel, tolls/zone charges and subcontract driver pay", () => {
    const e = evaluateOffer(offer({
      loaded: { minutes: 120, fuelCost: 20 },
      tollsAndZoneCharges: 12.5,
      driverCost: 60,
    }), policy);
    expect(e.directCosts).toBe(162.5);
  });

  it("never guesses: missing times/costs give insufficient_data with names", () => {
    const e = evaluateOffer(offer({
      positioning: { minutes: null, cost: 25 },
      loaded: { minutes: 120 }, // fuel neither costed nor marked client-paid
    }), policy);
    expect(e.verdict).toBe("insufficient_data");
    expect(e.contribution).toBeNull();
    expect(e.missing).toEqual(expect.arrayContaining([
      "positioning.minutes",
      "loaded.fuelCost (or fuelPaidByClient: true)",
    ]));
  });

  it("with no price yet, still returns break-even and target price to quote from", () => {
    const e = evaluateOffer(offer({ offeredPrice: null }), policy);
    expect(e.verdict).toBe("insufficient_data");
    expect(e.missing).toEqual(["offeredPrice"]);
    expect(e.breakEvenPrice).toBe(70);
    expect(e.targetPrice).toBe(245);
  });

  it("flags an unconfirmed start as provisional", () => {
    const e = evaluateOffer(offer({ startConfirmed: false }), policy);
    expect(e.provisional).toBe(true);
    expect(e.warnings.join(" ")).toMatch(/confirmed driver location/);
  });

  it("rejects an invalid policy instead of producing a verdict", () => {
    expect(evaluateOffer(offer(), { targetContributionPerHour: 0, minContributionPerJob: 40 }).verdict).toBe("insufficient_data");
  });
});

describe("evaluateChain", () => {
  it("judges back-to-back jobs as one run: a weak job can unlock a good one", () => {
    const first = offer({ ref: "A", offeredPrice: 120, returnLeg: null });
    const second = offer({ ref: "B", offeredPrice: 200, positioning: { minutes: 20, cost: 6 } });
    const c = evaluateChain([first, second], policy);
    // costs 25 + 6 + 45 = 76; price 320; contribution 244
    // minutes A: 90+120+30+30 = 270, B: 20+120+150+30+30 = 350 → 620 (10.33h)
    expect(c.contribution).toBe(244);
    expect(c.totalMinutes).toBe(620);
    expect(c.contributionPerHour).toBe(23.61);
    expect(c.verdict).toBe("negotiate");
    expect(c.jobs).toHaveLength(2);
  });

  it("requires the last job to get the driver home", () => {
    const c = evaluateChain([offer({ returnLeg: null })], policy);
    expect(c.verdict).toBe("insufficient_data");
    expect(c.missing[0]).toMatch(/returnLeg/);
  });
});

describe("policyFromWeeklyTarget", () => {
  it("derives a traceable hourly target", () => {
    expect(policyFromWeeklyTarget({
      weeklyContributionTarget: 2000, workingDaysPerWeek: 5, workingHoursPerDay: 10, minContributionPerJob: 40,
    })).toEqual({ targetContributionPerHour: 40, minContributionPerJob: 40 });
  });
});
