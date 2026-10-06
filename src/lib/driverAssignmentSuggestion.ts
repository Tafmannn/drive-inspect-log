/**
 * Smart driver-assignment suggestion — a ranking, not an automatic
 * assignment. The admin still picks; this only reorders/annotates the
 * existing driver list in AssignDriverModal by proximity and capacity.
 *
 * Deliberately does NOT filter by preferred_regions/unavailable_regions:
 * those are free-text-ish named regions ("South East", "Midlands", …)
 * with no reliable postcode-area mapping already in this codebase, and a
 * wrong postcode→region guess could silently hide a perfectly good
 * driver from the list — a worse failure than not filtering on it at
 * all. Only max_daily_distance is enforced, because it's a plain number
 * compared against a measured distance, nothing is guessed.
 */

export interface AssignmentCandidate {
  driverId: string;
  /** Miles from the driver's home postcode to the job's pickup postcode, or null if unknown (no home postcode set, or the route lookup failed). */
  distanceMiles: number | null;
  maxDailyDistanceMiles: number | null;
}

export interface RankedCandidate {
  driverId: string;
  distanceMiles: number | null;
  /** True if distanceMiles is known and exceeds the driver's own stated max_daily_distance. Advisory only — never removes the driver from the list. */
  outsideRange: boolean;
}

/**
 * Ranks candidates: known distances first (nearest first), unknown
 * distances after (stable order), with out-of-range drivers pushed to
 * the end of whichever group they're in rather than removed.
 */
export function rankDriverCandidates(candidates: AssignmentCandidate[]): RankedCandidate[] {
  const ranked: RankedCandidate[] = candidates.map((c) => ({
    driverId: c.driverId,
    distanceMiles: c.distanceMiles,
    outsideRange:
      c.distanceMiles != null &&
      c.maxDailyDistanceMiles != null &&
      c.distanceMiles > c.maxDailyDistanceMiles,
  }));

  const rank = (c: RankedCandidate): number => {
    if (c.distanceMiles == null) return 2; // unknown distance — after known, before nothing
    return c.outsideRange ? 1 : 0; // known + in range first, known + out of range next
  };

  return [...ranked].sort((a, b) => {
    const rA = rank(a);
    const rB = rank(b);
    if (rA !== rB) return rA - rB;
    if (a.distanceMiles != null && b.distanceMiles != null) return a.distanceMiles - b.distanceMiles;
    return 0; // preserve original relative order within a tier
  });
}
