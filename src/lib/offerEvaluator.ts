/**
 * offerEvaluator — should we bid on / accept this job (or run of jobs)?
 *
 * Pure function, no I/O. Used by the `axentra-offer-check` Claude skill via
 * scripts/offer-check.ts, and importable by the app later.
 *
 * It answers in money per working hour, because a £180 job that eats nine
 * hours of trains and waiting is worse than a £120 job that takes four.
 *
 * Truth rules:
 *   - Never fills in a missing time or cost. A missing input makes the
 *     verdict "insufficient_data" and is listed by name.
 *   - Positioning must start from the driver's last CONFIRMED location; if
 *     it does not, the result is flagged provisional and must not be used
 *     as a firm commitment.
 *   - Contribution is price minus direct job costs. It is NOT profit and NOT
 *     take-home pay: overheads (insurance, plates, phone, software) and tax
 *     come out of it afterwards.
 */

export interface OfferLeg {
  /** Door-to-door minutes for this leg. Required. */
  minutes: number | null;
  /** Out-of-pocket £ for this leg (fares, taxi, own-car fuel). Required; 0 is valid. */
  cost: number | null;
  miles?: number | null;
  note?: string;
}

export interface OfferInput {
  ref?: string;
  /** Price offered / quoted for the job, £, as received (before platform fee). */
  offeredPrice: number | null;
  /** True only if `positioning` starts from the driver's last confirmed location. */
  startConfirmed: boolean;
  /** Getting the driver from where they are to the collection. */
  positioning: OfferLeg;
  /** Driving the customer vehicle from collection to delivery. */
  loaded: {
    minutes: number | null;
    miles?: number | null;
    /**
     * Fuel we pay for and cannot recharge, £. Required unless the client pays fuel
     * (`fuelPaidByClient: true`, or `fuelPolicy: "recharged"`).
     */
    fuelCost?: number | null;
    fuelPaidByClient?: boolean;
    /**
     * The client's fuel policy (`clients.fuel_policy`). Look it up; never guess it.
     *   "recharged": the client pays fuel on top, so it is not our cost
     *                (same as `fuelPaidByClient: true`).
     *   "included":  the price already covers fuel, so it IS our cost and `fuelCost`
     *                is required.
     * Leave it out when the client is not known: `fuelCost` or `fuelPaidByClient` is
     * then required, as before. An explicit `fuelPaidByClient` always wins (a one-off
     * recharge); a `fuelPaidByClient: true` on a fuel-included client is flagged.
     */
    fuelPolicy?: "recharged" | "included" | null;
  };
  /**
   * Getting home / back to base after delivery. Set to null ONLY when the
   * next job in a chain starts from this delivery (its positioning leg then
   * carries the travel).
   */
  returnLeg: OfferLeg | null;
  /** Collection + delivery inspection / appraisal time. Required; 0 is valid. */
  inspectionMinutes: number | null;
  /** Expected waiting at either end, minutes. Defaults to 0. */
  waitingMinutes?: number;
  /** Tolls, CAZ, ULEZ, congestion charge not recharged, £. Defaults to 0. */
  tollsAndZoneCharges?: number;
  /** Paid to a subcontracted driver for this job, £. Omit/0 for owner-driver. */
  driverCost?: number;
  /** Platform commission as a fraction of price (0.1 = 10%). Defaults to 0. */
  platformFeeFraction?: number;
}

export interface OfferPolicy {
  /** Contribution per working hour the business needs, £/h. */
  targetContributionPerHour: number;
  /** Below this contribution a job is declined whatever the hourly rate, £. */
  minContributionPerJob: number;
}

export type OfferVerdict = "accept" | "negotiate" | "decline" | "insufficient_data";

export interface OfferEvaluation {
  ref?: string;
  verdict: OfferVerdict;
  provisional: boolean;
  missing: string[];
  warnings: string[];
  price: number | null;
  directCosts: number | null;
  contribution: number | null;
  totalMinutes: number | null;
  contributionPerHour: number | null;
  /** Share of the day spent travelling without the customer vehicle. */
  deadTimeShare: number | null;
  breakEvenPrice: number | null;
  /** Price at which this job meets the hourly target (and the per-job minimum). */
  targetPrice: number | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

interface Parts {
  missing: string[];
  warnings: string[];
  minutes: number;
  deadMinutes: number;
  costsExFee: number;
  feeFraction: number;
}

function collect(o: OfferInput, label: string): Parts {
  const missing: string[] = [];
  const warnings: string[] = [];
  let minutes = 0;
  let deadMinutes = 0;
  let costsExFee = 0;

  const need = (v: unknown, name: string): number => {
    if (isNum(v) && v >= 0) return v;
    missing.push(`${label}${name}`);
    return 0;
  };

  const posMin = need(o.positioning?.minutes, "positioning.minutes");
  costsExFee += need(o.positioning?.cost, "positioning.cost");
  minutes += posMin;
  deadMinutes += posMin;

  minutes += need(o.loaded?.minutes, "loaded.minutes");
  const fuelPolicy = o.loaded?.fuelPolicy ?? null;
  const fuelPaidByClient = o.loaded?.fuelPaidByClient ?? fuelPolicy === "recharged";
  if (o.loaded?.fuelPaidByClient === true && fuelPolicy === "included") {
    warnings.push(`${label}fuel is marked client-paid, but this client's price includes fuel — check this is a one-off recharge`);
  }
  if (!fuelPaidByClient) {
    costsExFee += need(
      o.loaded?.fuelCost,
      fuelPolicy === "included"
        ? "loaded.fuelCost (this client's price includes fuel, so it is our cost)"
        : "loaded.fuelCost (or fuelPaidByClient: true)",
    );
  }

  if (o.returnLeg) {
    const retMin = need(o.returnLeg.minutes, "returnLeg.minutes");
    costsExFee += need(o.returnLeg.cost, "returnLeg.cost");
    minutes += retMin;
    deadMinutes += retMin;
  }

  minutes += need(o.inspectionMinutes, "inspectionMinutes");
  minutes += isNum(o.waitingMinutes) && o.waitingMinutes > 0 ? o.waitingMinutes : 0;
  costsExFee += isNum(o.tollsAndZoneCharges) && o.tollsAndZoneCharges > 0 ? o.tollsAndZoneCharges : 0;
  costsExFee += isNum(o.driverCost) && o.driverCost > 0 ? o.driverCost : 0;

  const fee = isNum(o.platformFeeFraction) ? o.platformFeeFraction : 0;
  if (fee < 0 || fee >= 1) missing.push(`${label}platformFeeFraction (must be 0 to <1)`);

  if (!o.startConfirmed) {
    warnings.push(`${label}positioning does not start from a confirmed driver location — result is provisional`);
  }
  return { missing, warnings, minutes, deadMinutes, costsExFee, feeFraction: fee >= 0 && fee < 1 ? fee : 0 };
}

function judge(
  price: number,
  parts: Parts,
  policy: OfferPolicy,
): Pick<OfferEvaluation, "verdict" | "directCosts" | "contribution" | "totalMinutes" | "contributionPerHour" | "deadTimeShare" | "breakEvenPrice" | "targetPrice"> {
  const hours = parts.minutes / 60;
  const directCosts = parts.costsExFee + price * parts.feeFraction;
  const contribution = price - directCosts;
  const cph = hours > 0 ? contribution / hours : null;
  const keep = 1 - parts.feeFraction;
  const breakEven = parts.costsExFee / keep;
  const needed = Math.max(policy.targetContributionPerHour * hours, policy.minContributionPerJob);
  const targetPrice = (parts.costsExFee + needed) / keep;

  let verdict: OfferVerdict;
  if (contribution < policy.minContributionPerJob || contribution <= 0) verdict = "decline";
  else if (cph != null && cph >= policy.targetContributionPerHour) verdict = "accept";
  else verdict = "negotiate";

  return {
    verdict,
    directCosts: r2(directCosts),
    contribution: r2(contribution),
    totalMinutes: Math.round(parts.minutes),
    contributionPerHour: cph == null ? null : r2(cph),
    deadTimeShare: parts.minutes > 0 ? r2(parts.deadMinutes / parts.minutes) : null,
    breakEvenPrice: r2(breakEven),
    targetPrice: r2(Math.ceil(targetPrice)),
  };
}

const EMPTY = {
  directCosts: null, contribution: null, totalMinutes: null, contributionPerHour: null,
  deadTimeShare: null, breakEvenPrice: null, targetPrice: null,
};

function validatePolicy(policy: OfferPolicy): string[] {
  const bad: string[] = [];
  if (!isNum(policy.targetContributionPerHour) || policy.targetContributionPerHour <= 0) bad.push("policy.targetContributionPerHour");
  if (!isNum(policy.minContributionPerJob) || policy.minContributionPerJob < 0) bad.push("policy.minContributionPerJob");
  return bad;
}

export function evaluateOffer(o: OfferInput, policy: OfferPolicy): OfferEvaluation {
  const parts = collect(o, "");
  const missing = [...validatePolicy(policy), ...parts.missing];
  if (!o.returnLeg) parts.warnings.push("no return leg: only valid if the next job starts from this delivery — use evaluateChain");
  const price = isNum(o.offeredPrice) && o.offeredPrice > 0 ? o.offeredPrice : null;
  if (price == null) missing.unshift("offeredPrice");

  const base = { ref: o.ref, provisional: !o.startConfirmed, warnings: parts.warnings, price };
  // Costs/time known but no price yet → still give break-even and target price to quote from.
  if (missing.length > 0) {
    if (missing.length === 1 && missing[0] === "offeredPrice") {
      const j = judge(0, parts, policy);
      return { ...base, ...EMPTY, verdict: "insufficient_data", missing, breakEvenPrice: j.breakEvenPrice, targetPrice: j.targetPrice, totalMinutes: j.totalMinutes };
    }
    return { ...base, ...EMPTY, verdict: "insufficient_data", missing };
  }
  return { ...base, missing, ...judge(price as number, parts, policy) };
}

export interface ChainEvaluation extends Omit<OfferEvaluation, "ref"> {
  jobs: OfferEvaluation[];
}

/**
 * A run of jobs done back-to-back by one driver. Every job except the last
 * must have returnLeg = null (the next job's positioning carries the travel);
 * the last must have a real return leg. Judged as one unit, because a
 * poor job can be worth taking if it positions the driver for a good one.
 */
export function evaluateChain(offers: OfferInput[], policy: OfferPolicy): ChainEvaluation {
  const missing: string[] = [...validatePolicy(policy)];
  const warnings: string[] = [];
  if (offers.length === 0) missing.push("offers (empty chain)");

  let minutes = 0, dead = 0, costs = 0, fees = 0, price = 0;
  offers.forEach((o, i) => {
    const label = `job ${i + 1}${o.ref ? ` (${o.ref})` : ""}: `;
    const isLast = i === offers.length - 1;
    if (!isLast && o.returnLeg) warnings.push(`${label}has a return leg but is not last — it will be counted; remove it if the driver goes straight to the next job`);
    if (isLast && !o.returnLeg) missing.push(`${label}returnLeg (the last job must get the driver home)`);
    if (i > 0 && o.startConfirmed) warnings.push(`${label}startConfirmed is true mid-chain; its start is the previous delivery, which is only confirmed once that job is done`);
    const p = collect({ ...o, startConfirmed: i === 0 ? o.startConfirmed : true }, label);
    missing.push(...p.missing);
    warnings.push(...p.warnings);
    if (!(isNum(o.offeredPrice) && o.offeredPrice > 0)) missing.push(`${label}offeredPrice`);
    const pr = isNum(o.offeredPrice) ? o.offeredPrice : 0;
    price += pr;
    minutes += p.minutes;
    dead += p.deadMinutes;
    costs += p.costsExFee;
    fees += pr * p.feeFraction;
  });

  const jobs = offers.map((o, i) => evaluateOffer({ ...o, startConfirmed: i === 0 ? o.startConfirmed : true }, policy));
  const provisional = !offers[0]?.startConfirmed;

  if (missing.length > 0) {
    return { jobs, verdict: "insufficient_data", provisional, missing, warnings, price: null, ...EMPTY };
  }
  // Treat the chain as one job whose fee is the blended fee fraction.
  const feeFraction = price > 0 ? fees / price : 0;
  const j = judge(price, { missing: [], warnings, minutes, deadMinutes: dead, costsExFee: costs, feeFraction }, policy);
  return { jobs, provisional, missing, warnings, price: r2(price), ...j };
}

/** Policy derived from a weekly contribution target, so the numbers are traceable. */
export function policyFromWeeklyTarget(input: {
  weeklyContributionTarget: number;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  minContributionPerJob: number;
}): OfferPolicy {
  const hours = input.workingDaysPerWeek * input.workingHoursPerDay;
  return {
    targetContributionPerHour: hours > 0 ? r2(input.weeklyContributionTarget / hours) : NaN,
    minContributionPerJob: input.minContributionPerJob,
  };
}
