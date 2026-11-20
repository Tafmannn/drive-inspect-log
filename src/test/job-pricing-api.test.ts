import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { chunk: string[] }[] = [];
const upserts: { row: Record<string, unknown>; opts: unknown }[] = [];
let upsertError: { message: string } | null = null;
type Reply = { data: Record<string, unknown>[] | null; error: { message: string } | null };
let respond: (chunk: string[]) => Reply;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      expect(table).toBe("job_pricing");
      return {
        upsert: async (row: Record<string, unknown>, opts: unknown) => {
          upserts.push({ row, opts });
          return { error: upsertError };
        },
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

vi.mock("@/lib/orgHelper", () => ({ getOrgId: async () => "org-1" }));

import {
  pickPricingFields,
  saveJobPricing,
  fetchPricingByJobId,
  mergePricing,
  withPricing,
  withPricingOne,
  PRICING_CHUNK_SIZE,
} from "@/lib/jobPricingApi";

beforeEach(() => {
  calls.length = 0;
  upserts.length = 0;
  upsertError = null;
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

  it("pickPricingFields keeps only the seven pricing keys and drops undefined", () => {
    expect(
      pickPricingFields({ total_price: 1, rate_per_mile: null, status: "x", admin_rate: undefined }),
    ).toEqual({ total_price: 1, rate_per_mile: null });
  });

  it("saveJobPricing upserts only the given fields for the job, with the org id", async () => {
    await saveJobPricing("j1", { total_price: 50, status: "completed", driver_name: "x" });
    expect(upserts).toEqual([
      { row: { job_id: "j1", org_id: "org-1", total_price: 50 }, opts: { onConflict: "job_id" } },
    ]);
  });

  it("saveJobPricing can clear a price (null is written, not skipped)", async () => {
    await saveJobPricing("j1", { total_price: null });
    expect(upserts[0].row).toEqual({ job_id: "j1", org_id: "org-1", total_price: null });
  });

  it("saveJobPricing does nothing when the payload has no pricing fields", async () => {
    await saveJobPricing("j1", { status: "completed" });
    expect(upserts).toHaveLength(0);
  });

  it("saveJobPricing surfaces a database error", async () => {
    upsertError = { message: "denied" };
    await expect(saveJobPricing("j1", { total_price: 1 })).rejects.toEqual({ message: "denied" });
  });
});
