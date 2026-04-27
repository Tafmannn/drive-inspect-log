/**
 * pricingDelta — pure helper to describe the difference between a job's
 * current saved total_price and an advisory suggestedPrice.
 *
 * Used by the PricingSuggestionPanel UI; extracted so it can be unit-tested
 * without rendering React.
 *
 * Severity bands (relative to current price, when current > 0):
 *   < 5%   → "none"   (no badge needed)
 *   < 15%  → "minor"  (informational)
 *   < 30%  → "notable" (warn)
 *   ≥ 30%  → "major"   (strong warn)
 *
 * If current price is missing or zero, severity is "unknown" (no comparison
 * possible) and the helper still returns the suggestion in absolute terms.
 */

export type PriceDeltaSeverity = "none" | "minor" | "notable" | "major" | "unknown";
export type PriceDeltaDirection = "higher" | "lower" | "equal" | "unknown";

export interface PriceDelta {
  /** Absolute £ difference (suggested − current). 0 when comparison impossible. */
  absolute: number;
  /** Percent difference relative to current. null when current ≤ 0. */
  percent: number | null;
  direction: PriceDeltaDirection;
  severity: PriceDeltaSeverity;
  /** Short human label, e.g. "+£42.00 (17%) higher". */
  label: string;
  /** True when the swing is large enough to warrant a UI warning. */
  warn: boolean;
}

const NONE = 0.05;
const MINOR = 0.15;
const NOTABLE = 0.3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePriceDelta(
  currentPrice: number | null | undefined,
  suggestedPrice: number | null | undefined,
): PriceDelta {
  // No suggestion → nothing to compare.
  if (typeof suggestedPrice !== "number" || !Number.isFinite(suggestedPrice)) {
    return {
      absolute: 0,
      percent: null,
      direction: "unknown",
      severity: "unknown",
      label: "No suggestion",
      warn: false,
    };
  }

  // No current price → just describe the suggestion.
  if (
    typeof currentPrice !== "number" ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return {
      absolute: round2(suggestedPrice),
      percent: null,
      direction: "unknown",
      severity: "unknown",
      label: `No saved price to compare (suggestion £${suggestedPrice.toFixed(2)})`,
      warn: false,
    };
  }

  const abs = round2(suggestedPrice - currentPrice);
  const pct = (suggestedPrice - currentPrice) / currentPrice;
  const absPct = Math.abs(pct);

  let direction: PriceDeltaDirection;
  if (absPct < 0.001) direction = "equal";
  else direction = suggestedPrice > currentPrice ? "higher" : "lower";

  let severity: PriceDeltaSeverity;
  if (absPct < NONE) severity = "none";
  else if (absPct < MINOR) severity = "minor";
  else if (absPct < NOTABLE) severity = "notable";
  else severity = "major";

  const sign = abs > 0 ? "+" : "";
  const pctRounded = Math.round(absPct * 100);
  const label =
    direction === "equal"
      ? "Matches current price"
      : `${sign}£${abs.toFixed(2)} (${pctRounded}%) ${direction} than current`;

  return {
    absolute: abs,
    percent: round2(pct * 100),
    direction,
    severity,
    label,
    warn: severity === "notable" || severity === "major",
  };
}
