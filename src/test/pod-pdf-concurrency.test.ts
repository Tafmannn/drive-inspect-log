import { describe, it, expect } from "vitest";
import { forEachLimited, THUMB_CONCURRENCY } from "@/lib/podPdf";

describe("forEachLimited (POD photo loading)", () => {
  it("never has more than the limit in flight, and visits every item even when some fail", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await forEachLimited(Array.from({ length: 20 }, (_, i) => i), THUMB_CONCURRENCY, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      seen.push(i);
      if (i % 7 === 0) throw new Error("boom");
    });
    expect(peak).toBeLessThanOrEqual(THUMB_CONCURRENCY);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("handles an empty list", async () => {
    await expect(forEachLimited([], 3, async () => {})).resolves.toBeUndefined();
  });
});
