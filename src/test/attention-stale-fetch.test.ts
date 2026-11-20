import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Record<string, unknown[]> = {};
let jobsResult: { data: unknown; error: unknown } = { data: [], error: null };
const pricing = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "lt"]) {
    chain[m] = (...args: unknown[]) => { calls[m] = args; return chain; };
  }
  chain.limit = async (n: number) => { calls.limit = [n]; return jobsResult; };
  return { supabase: { from: (t: string) => { calls.from = [t]; return chain; } } };
});
vi.mock("@/lib/jobPricingApi", () => ({ withPricing: (rows: unknown[]) => pricing(rows) }));

import { fetchStaleCompletedJobs } from "@/features/attention/api/staleUnpriced";
import { isAlreadyInvoicedError } from "@/features/invoicing/api/createInvoice";

beforeEach(() => { pricing.mockReset(); pricing.mockImplementation(async (rows: unknown[]) => rows); });

describe("fetchStaleCompletedJobs", () => {
  it("asks for completed jobs strictly older than the 180-day lookback", async () => {
    jobsResult = { data: [{ id: "j1", org_id: "o", completed_at: "2026-01-01" }], error: null };
    const now = Date.parse("2026-11-20T00:00:00Z");
    const rows = await fetchStaleCompletedJobs(now);
    expect(calls.from).toEqual(["jobs"]);
    expect(calls.in).toEqual(["status", ["completed", "closed"]]);
    expect(calls.lt).toEqual(["completed_at", new Date(now - 180 * 86_400_000).toISOString()]);
    expect(pricing).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
  });

  it("throws on a read error instead of reporting nothing unpriced", async () => {
    jobsResult = { data: null, error: new Error("rls") };
    await expect(fetchStaleCompletedJobs()).rejects.toThrow("rls");
    expect(pricing).not.toHaveBeenCalled();
  });
});

describe("isAlreadyInvoicedError", () => {
  it("only true for unique_violation", () => {
    expect(isAlreadyInvoicedError({ code: "23505" })).toBe(true);
    expect(isAlreadyInvoicedError({ code: "42501" })).toBe(false);
    expect(isAlreadyInvoicedError(null)).toBe(false);
    expect(isAlreadyInvoicedError("23505")).toBe(false);
  });
});
