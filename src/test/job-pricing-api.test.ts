import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { chunk: string[] }[] = [];
type Reply = { data: Record<string, unknown>[] | null; error: { message: string } | null };
let respond: (chunk: string[]) => Reply;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      expect(table).toBe("job_pricing");
      return {
        select: () => ({
          in: async (_col: string, chunk: string[]) => {
            calls.push({ chunk });
            return respond(chunk);
          },
        }),
      };
    },
  },
}));

import {
  fetchPricingByJobId,
  mergePricing,
  withPricing,
  withPricingOne,
  PRICING_CHUNK_SIZE,
} from "@/lib/jobPricingApi";

beforeEach(() => {
  calls.length = 0;
  respond = (chunk) => ({
    data: chunk.map((id) => ({ job_id: id, total_price: 100, rate_per_mile: 1.5, admin_rate: null })),
    error: null,
  });
});

describe("job pricing api", () => {
  it("asks for nothing when there are no jobs", async () => {
    expect(await withPricing([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("de-duplicates ids and splits big lists into chunks", async () => {
    const ids = Array.from({ length: PRICING_CHUNK_SIZE * 2 + 1 }, (_, i) => `j${i}`);
    const map = await fetchPricingByJobId([...ids, ...ids, ""]);
    expect(calls.map((c) => c.chunk.length)).toEqual([PRICING_CHUNK_SIZE, PRICING_CHUNK_SIZE, 1]);
    expect(map.size).toBe(ids.length);
  });

  it("puts the pricing fields onto each job and nulls fields the row lacks", async () => {
    const [a] = await withPricing([{ id: "a", total_price: 5, caz_ulez_cost: 9, name: "x" }]);
    expect(a).toMatchObject({ id: "a", name: "x", total_price: 100, rate_per_mile: 1.5, caz_ulez_cost: null });
  });

  it("leaves a job alone when it has no pricing row (a driver)", async () => {
    respond = () => ({ data: [], error: null });
    const job = { id: "a", total_price: null };
    expect(await withPricingOne(job)).toEqual(job);
  });

  it("mergePricing does not mutate its input", () => {
    const job = { id: "a", total_price: 1 };
    const out = mergePricing([job], new Map([["a", { job_id: "a", total_price: 2 }]]));
    expect(out[0].total_price).toBe(2);
    expect(job.total_price).toBe(1);
  });

  it("falls back to the job's own values when the lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    respond = () => ({ data: null, error: { message: "relation does not exist" } });
    const job = { id: "a", total_price: 7 };
    expect(await withPricingOne(job)).toEqual(job);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
