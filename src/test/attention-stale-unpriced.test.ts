import { describe, it, expect } from "vitest";
import { deriveStaleUnpricedSummary } from "@/features/attention/engine/exceptionEngine";

// 43 of 50 unpriced completed jobs in prod (20 Nov 2026) were older than the
// 180-day billing lookback and so appeared nowhere in the Attention Center.

const row = (org_id: string, completed_at: string, total_price: number | null) => ({ org_id, completed_at, total_price });

describe("deriveStaleUnpricedSummary", () => {
  it("one summary per org counting only unpriced jobs", () => {
    const out = deriveStaleUnpricedSummary([
      row("A", "2026-03-01T00:00:00Z", null),
      row("A", "2026-02-01T00:00:00Z", 0),
      row("A", "2026-04-01T00:00:00Z", 120),
      row("B", "2026-05-01T00:00:00Z", null),
    ]);
    expect(out).toHaveLength(2);
    const a = out.find((e) => e.orgId === "A")!;
    expect(a.title).toBe("2 older completed jobs with no price");
    expect(a.category).toBe("billing");
    expect(a.createdAt).toBe("2026-02-01T00:00:00Z");
    expect(a.actionRoute).toBe("/jobs/completed");
    expect(out.find((e) => e.orgId === "B")!.title).toBe("1 older completed job with no price");
  });

  it("nothing when every old job is priced", () => {
    expect(deriveStaleUnpricedSummary([row("A", "2026-01-01T00:00:00Z", 50)])).toEqual([]);
  });

  it("stable id so acknowledgements stick", () => {
    const a = deriveStaleUnpricedSummary([row("A", "2026-01-01T00:00:00Z", null)])[0];
    const b = deriveStaleUnpricedSummary([row("A", "2026-01-01T00:00:00Z", null), row("A", "2026-01-02T00:00:00Z", null)])[0];
    expect(a.id).toBe(b.id);
  });
});
