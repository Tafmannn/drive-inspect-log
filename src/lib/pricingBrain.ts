/**
 * pricingBrain — Stage 8 advisory pricing engine.
 *
 * Pure function. Suggests a price for a job given the inputs we have,
 * surfaces reasoning, warns about missing data, and NEVER overrides an
 * admin-entered price. The output is advisory only — invoicing always
 * uses the persisted `total_price` (see invoiceReadiness.ts).
 *
 * Strict rules (from product brief):
 *   - Do not overwrite admin-entered prices. If `adminOverridePrice` is
 *     set, it is returned as-is with confidence='high' and a reason
 *     stating the override is preserved.
 *   - Suggested price is NOT a final invoice price. The output schema
 *     deliberately separates `suggestedPrice` from any concept of
 *     "final" / "billable" / "invoice" amounts.
 *   - Protect minimum margin: never suggest below the configured
 *     minimum charge.
 *   - If route miles are missing, return a `missingInputs` entry and
 *     do not synthesise a price (suggestedPrice = null).
 *   - If CAZ/ULEZ data is unavailable, do not guess — surface as
 *     missing input and emit a warning when the route plausibly enters
 *     a CAZ zone (we cannot detect this from miles alone, so we simply
 *     stay silent unless the caller passes `cazRisk`).
 *
 * No DB writes. No side effects.
 */

export type PricingConfidence = "low" | "medium" | "high";

export interface PricingInputs {
  /** If set, this admin-entered price is preserved verbatim. */
  adminOverridePrice?: number | null;

  /** Route distance in miles. Required for a numeric suggestion. */
  routeMiles?: number | null;

  /** Per-mile rate. Defaults to MIN_RATE_PER_MILE if not provided. */
  ratePerMile?: number | null;

  /** Minimum charge floor. Defaults to MIN_CHARGE if not provided. */
  minimumCharge?: number | null;

  /** Estimated fuel cost (£). Optional add-on. */
  fuelEstimate?: number | null;

  /** Estimated return travel / public transport cost (£). Optional add-on. */
  returnTravelEstimate?: number | null;

  /**
   * Clean air zone exposure. We never guess — the caller must supply.
   * `null`/`undefined` means "data not available" and is surfaced as
   * a missing input.
   */
  cazRisk?: { zoneCount: number; estimatedCost: number } | null;

  /** "standard" | "same_day" | "urgent" — applied as a multiplier. */
  urgency?: "standard" | "same_day" | "urgent" | null;

  /** Estimated waiting/dwell time, minutes. Optional. */
  waitingMinutes?: number | null;

  /**
   * Client rate card. If a rate-per-mile is provided here it overrides
   * the generic ratePerMile. If a flat agreedPrice is provided it is
   * used as the suggestion verbatim (still capped to minimumCharge).
   */
  clientRateCard?: {
    ratePerMile?: number | null;
    minimumCharge?: number | null;
    agreedPrice?: number | null;
  } | null;

  /** "Single" | "Multi" | etc. Currently informational only. */
  jobType?: string | null;
}

export interface PricingSuggestion {
  suggestedPrice: number | null;
  confidence: PricingConfidence;
  reasons: string[];
  warnings: string[];
  missingInputs: string[];
  /** Component breakdown for UI tooltips. */
  breakdown: {
    distance?: number;
    minimum?: number;
    fuel?: number;
    returnTravel?: number;
    caz?: number;
    urgencyMultiplier?: number;
    waitingSurcharge?: number;
  };
  /** Always false — suggestion is never a final invoice price. */
  isFinalInvoicePrice: false;
}

/* ─── Defaults ───────────────────────────────────────────────────── */

export const PRICING_DEFAULTS = {
  MIN_CHARGE: 50,
  MIN_RATE_PER_MILE: 1.2,
  WAITING_RATE_PER_HOUR: 25,
  WAITING_FREE_MINUTES: 15,
  URGENCY_MULTIPLIERS: {
    standard: 1.0,
    same_day: 1.15,
    urgent: 1.3,
  } as const,
  /** Distance bands for confidence scoring (miles). */
  SHORT_BAND_MAX: 25,
  LONG_BAND_MIN: 200,
  /** Margin floor as a fraction of input cost (fuel + return + CAZ). */
  MIN_MARGIN_FRACTION: 0.15,
} as const;

/* ─── Helpers ────────────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isPositiveNumber(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/* ─── Core ───────────────────────────────────────────────────────── */

export function suggestJobPrice(inputs: PricingInputs): PricingSuggestion {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const missingInputs: string[] = [];
  const breakdown: PricingSuggestion["breakdown"] = {};

  // ── Rule 1: admin override is sacred ──────────────────────────────
  if (isPositiveNumber(inputs.adminOverridePrice)) {
    return {
      suggestedPrice: round2(inputs.adminOverridePrice),
      confidence: "high",
      reasons: ["Admin-entered price preserved (no override applied)"],
      warnings: [],
      missingInputs: [],
      breakdown: {},
      isFinalInvoicePrice: false,
    };
  }

  // ── Rule 2: client rate card flat agreedPrice short-circuit ───────
  const card = inputs.clientRateCard;
  if (card && isPositiveNumber(card.agreedPrice)) {
    const min = isPositiveNumber(card.minimumCharge)
      ? card.minimumCharge
      : isPositiveNumber(inputs.minimumCharge)
        ? inputs.minimumCharge
        : PRICING_DEFAULTS.MIN_CHARGE;
    const price = Math.max(card.agreedPrice, min);
    reasons.push("Client rate card flat price applied");
    if (price > card.agreedPrice) reasons.push("Floored to minimum charge");
    return {
      suggestedPrice: round2(price),
      confidence: "high",
      reasons,
      warnings,
      missingInputs,
      breakdown: { minimum: min },
      isFinalInvoicePrice: false,
    };
  }

  // ── Rule 3: route miles required for distance-based suggestion ────
  if (!isPositiveNumber(inputs.routeMiles)) {
    missingInputs.push("route_miles");
    warnings.push("Route distance unavailable — cannot suggest a price");
    return {
      suggestedPrice: null,
      confidence: "low",
      reasons,
      warnings,
      missingInputs,
      breakdown,
      isFinalInvoicePrice: false,
    };
  }

  // ── Rate selection ────────────────────────────────────────────────
  const ratePerMile = isPositiveNumber(card?.ratePerMile)
    ? (card!.ratePerMile as number)
    : isPositiveNumber(inputs.ratePerMile)
      ? inputs.ratePerMile
      : PRICING_DEFAULTS.MIN_RATE_PER_MILE;
  if (card?.ratePerMile && isPositiveNumber(card.ratePerMile)) {
    reasons.push(`Client rate £${ratePerMile.toFixed(2)}/mi applied`);
  } else if (!isPositiveNumber(inputs.ratePerMile)) {
    reasons.push(`Default rate £${ratePerMile.toFixed(2)}/mi applied`);
  } else {
    reasons.push(`Org rate £${ratePerMile.toFixed(2)}/mi applied`);
  }

  const minimumCharge = isPositiveNumber(card?.minimumCharge)
    ? (card!.minimumCharge as number)
    : isPositiveNumber(inputs.minimumCharge)
      ? inputs.minimumCharge
      : PRICING_DEFAULTS.MIN_CHARGE;

  // ── Distance component ────────────────────────────────────────────
  const distancePrice = inputs.routeMiles * ratePerMile;
  breakdown.distance = round2(distancePrice);
  reasons.push(`${inputs.routeMiles} mi × £${ratePerMile.toFixed(2)} = £${distancePrice.toFixed(2)}`);

  // ── Add-ons (only if explicitly provided) ─────────────────────────
  let addOns = 0;
  if (isPositiveNumber(inputs.fuelEstimate)) {
    addOns += inputs.fuelEstimate;
    breakdown.fuel = round2(inputs.fuelEstimate);
    reasons.push(`Fuel estimate £${inputs.fuelEstimate.toFixed(2)}`);
  } else {
    missingInputs.push("fuel_estimate");
  }

  if (isPositiveNumber(inputs.returnTravelEstimate)) {
    addOns += inputs.returnTravelEstimate;
    breakdown.returnTravel = round2(inputs.returnTravelEstimate);
    reasons.push(`Return travel £${inputs.returnTravelEstimate.toFixed(2)}`);
  } else {
    missingInputs.push("return_travel_estimate");
  }

  if (inputs.cazRisk && inputs.cazRisk.zoneCount > 0 && isPositiveNumber(inputs.cazRisk.estimatedCost)) {
    addOns += inputs.cazRisk.estimatedCost;
    breakdown.caz = round2(inputs.cazRisk.estimatedCost);
    reasons.push(
      `CAZ/ULEZ ${inputs.cazRisk.zoneCount} zone(s) +£${inputs.cazRisk.estimatedCost.toFixed(2)}`,
    );
  }
  // Note: when cazRisk is null/undefined OR zoneCount=0, do nothing.
  // We only flag CAZ/ULEZ when the route is known to enter such a zone.

  // ── Waiting time surcharge ────────────────────────────────────────
  if (isPositiveNumber(inputs.waitingMinutes)) {
    const billable = Math.max(0, inputs.waitingMinutes - PRICING_DEFAULTS.WAITING_FREE_MINUTES);
    const surcharge = (billable / 60) * PRICING_DEFAULTS.WAITING_RATE_PER_HOUR;
    if (surcharge > 0) {
      addOns += surcharge;
      breakdown.waitingSurcharge = round2(surcharge);
      reasons.push(`Waiting ${billable} min surcharge £${surcharge.toFixed(2)}`);
    }
  }

  // ── Urgency multiplier ────────────────────────────────────────────
  const urgency = inputs.urgency ?? "standard";
  const multiplier = PRICING_DEFAULTS.URGENCY_MULTIPLIERS[urgency] ?? 1;
  breakdown.urgencyMultiplier = multiplier;
  if (multiplier !== 1) {
    reasons.push(`Urgency ${urgency} ×${multiplier.toFixed(2)}`);
  }

  let raw = (distancePrice + addOns) * multiplier;

  // ── Minimum charge floor ──────────────────────────────────────────
  let suggested = raw;
  if (suggested < minimumCharge) {
    suggested = minimumCharge;
    breakdown.minimum = minimumCharge;
    reasons.push(`Floored to minimum charge £${minimumCharge.toFixed(2)}`);
  }

  // ── Margin protection ─────────────────────────────────────────────
  const totalCost = (breakdown.fuel ?? 0) + (breakdown.returnTravel ?? 0) + (breakdown.caz ?? 0);
  const minMargin = totalCost * PRICING_DEFAULTS.MIN_MARGIN_FRACTION;
  if (totalCost > 0 && suggested - totalCost < minMargin) {
    const adjusted = totalCost + Math.max(minMargin, minimumCharge * 0.2);
    if (adjusted > suggested) {
      suggested = adjusted;
      reasons.push("Adjusted upward to protect minimum margin");
      warnings.push("Costs are high relative to distance — review rate card");
    }
  }

  // ── Confidence scoring ────────────────────────────────────────────
  let confidence: PricingConfidence = "medium";
  const miles = inputs.routeMiles;
  if (
    missingInputs.length === 0 &&
    miles >= PRICING_DEFAULTS.SHORT_BAND_MAX &&
    miles <= PRICING_DEFAULTS.LONG_BAND_MIN &&
    !!card
  ) {
    confidence = "high";
  } else if (
    missingInputs.length >= 3 ||
    miles < PRICING_DEFAULTS.SHORT_BAND_MAX ||
    miles > PRICING_DEFAULTS.LONG_BAND_MIN
  ) {
    confidence = "low";
    if (miles < PRICING_DEFAULTS.SHORT_BAND_MAX) {
      reasons.push("Short distance band — confidence reduced");
    }
    if (miles > PRICING_DEFAULTS.LONG_BAND_MIN) {
      reasons.push("Long distance band — confidence reduced");
    }
  }

  if (missingInputs.includes("caz_risk") && miles > 50) {
    warnings.push("CAZ/ULEZ exposure unknown for a long route — verify before quoting");
  }

  return {
    suggestedPrice: round2(suggested),
    confidence,
    reasons,
    warnings,
    missingInputs,
    breakdown,
    isFinalInvoicePrice: false,
  };
}
