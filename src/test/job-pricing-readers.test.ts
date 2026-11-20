/* eslint-disable @typescript-eslint/no-explicit-any -- chainable database stub */
/**
 * Everything that shows a job price reads it from job_pricing (phase 2 of docs/security/job-pricing-split.md):
 * the job API, the JSON backup, the export, the operations bucket count and the MCP tools. The database is a
 * chainable stub: any query method returns the chain, and awaiting it gives that table's canned result.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const tables: Record<string, unknown> = {};
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const chain = (result: unknown, table = ""): any => {
    const c: any = new Proxy(function () {}, {
      get: (_t, prop) =>
        prop === "then"
          ? (res: any, rej: any) => Promise.resolve(result).then(res, rej)
          : (...args: unknown[]) => (calls.push({ table, method: String(prop), args }), c),
      apply: () => c,
    });
    return c;
  };
  const client = {
    from: (t: string) => chain(tables[t] ?? { data: [], error: null }, t),
    rpc: () => chain({ data: "AX-1", error: null }),
  };
  return { tables, calls, chain, client, downloaded: [] as unknown[], csv: [] as unknown[][] };
});
const { chain, client } = h;

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.client }));
vi.mock("@/lib/orgHelper", () => ({ getOrgId: async () => "org-1" }));
vi.mock("@/lib/customerNotifyApi", () => ({ kickCustomerNotifications: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));
vi.mock("@/features/exports/api/csvWriter", () => ({
  downloadJson: (p: unknown) => h.downloaded.push(p),
  downloadCsv: vi.fn(),
  buildCsv: (_h: string[], rows: unknown[][]) => (h.csv.push(...rows), ""),
  isoRange: () => ({}),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => h.client }));
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (t: unknown) => t }));

import { listJobs, listCompletedJobs, getJob, createJob, updateJob } from "@/lib/api";
import { exportJsonBackup } from "@/features/exports/api/jsonBackup";
import { exportJobsCsvSql } from "@/features/exports/api/exportQueries";
import { countPricedCandidates } from "@/hooks/useAdminOperationsBuckets";
import listJobsTool from "@/lib/mcp/tools/list-jobs";
import getJobTool from "@/lib/mcp/tools/get-job";

const pricing = (rows: Record<string, unknown>[]) => ({ data: rows, error: null });
const ctx = (authed = true) => ({ isAuthenticated: () => authed, getToken: () => "t" }) as any;

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k];
  h.calls.length = 0;
  h.downloaded.length = 0;
  h.csv.length = 0;
  process.env.SUPABASE_URL = "http://x";
  process.env.SUPABASE_PUBLISHABLE_KEY = "k";
});

describe("job API puts the price from job_pricing onto each job", () => {
  beforeEach(() => {
    h.tables.job_pricing = pricing([{ job_id: "j1", total_price: 250, rate_per_mile: 1.5 }]);
  });

  it("listJobs", async () => {
    h.tables.jobs = { data: [{ id: "j1", total_price: null }, { id: "j2", total_price: null }], error: null };
    const jobs = await listJobs({ statuses: ["completed"] });
    expect(jobs.map((j) => j.total_price)).toEqual([250, null]);
  });

  it("listCompletedJobs", async () => {
    h.tables.jobs = { data: [{ id: "j1" }], error: null };
    expect((await listCompletedJobs())[0].total_price).toBe(250);
  });

  it("getJob", async () => {
    h.tables.jobs = { data: { id: "j1" }, error: null };
    expect((await getJob("j1")).rate_per_mile).toBe(1.5);
  });

  const jobsWrites = (method: "insert" | "update") =>
    h.calls.filter((c) => c.table === "jobs" && c.method === method).map((c) => c.args[0] as Record<string, unknown>);
  const pricingWrites = () => h.calls.filter((c) => c.table === "job_pricing" && c.method === "upsert").map((c) => c.args[0]);

  it("createJob keeps the price off the jobs row, writes it to job_pricing and returns it", async () => {
    h.tables.jobs = { data: { id: "j1" }, error: null };
    const job = await createJob({ vehicle_reg: "AB1", total_price: 250, caz_ulez_cost: 12, external_job_number: "X" } as any);
    expect(job.total_price).toBe(250);
    expect(jobsWrites("insert")[0]).toEqual({ vehicle_reg: "AB1", external_job_number: "X", org_id: "org-1" });
    expect(pricingWrites()[0]).toEqual({ job_id: "j1", org_id: "org-1", total_price: 250, caz_ulez_cost: 12 });
  });

  it("updateJob splits a mixed edit: job fields to jobs, price to job_pricing", async () => {
    h.tables.jobs = { data: { id: "j1" }, error: null };
    expect((await updateJob("j1", { total_price: 250, vehicle_reg: "ZZ9" })).total_price).toBe(250);
    expect(jobsWrites("update")[0]).toEqual({ vehicle_reg: "ZZ9" });
    expect(pricingWrites()[0]).toEqual({ job_id: "j1", org_id: "org-1", total_price: 250 });
  });

  it("a price-only updateJob does not write the jobs table at all", async () => {
    h.tables.jobs = { data: { id: "j1" }, error: null };
    await updateJob("j1", { total_price: null });
    expect(jobsWrites("update")).toHaveLength(0);
    expect(pricingWrites()[0]).toEqual({ job_id: "j1", org_id: "org-1", total_price: null });
  });

  it("a driver (no pricing rows) gets the job untouched", async () => {
    h.tables.job_pricing = pricing([]);
    h.tables.jobs = { data: [{ id: "j1", total_price: null }], error: null };
    expect((await listJobs())[0].total_price).toBeNull();
  });
});

describe("JSON backup includes the prices", () => {
  it("adds a job_pricing table and counts it", async () => {
    h.tables.job_pricing = pricing([{ job_id: "j1", total_price: 9 }]);
    const res = await exportJsonBackup();
    expect((h.downloaded[0] as any).job_pricing).toEqual([{ job_id: "j1", total_price: 9 }]);
    expect((h.downloaded[0] as any).schemaVersion).toBe("1.2");
    expect(res.counts.job_pricing).toBe(1);
  });

  it("fails loudly if the pricing table cannot be read", async () => {
    h.tables.job_pricing = { data: null, error: { message: "denied" } };
    await expect(exportJsonBackup()).rejects.toThrow("denied");
  });
});

describe("CSV export", () => {
  it("writes the price from job_pricing", async () => {
    h.tables.jobs = { data: [{ id: "j1", total_price: null, rate_per_mile: null }], error: null };
    h.tables.job_pricing = pricing([{ job_id: "j1", total_price: 410, rate_per_mile: 2 }]);
    await exportJobsCsvSql({});
    expect(h.csv[0]).toContain(410);
  });
});

describe("operations bucket 'ready to invoice' counts only priced jobs", () => {
  const q = (data: unknown, error: { message: string } | null = null) => chain({ data, error });

  it("counts jobs whose pricing row has a total above zero", async () => {
    h.tables.job_pricing = pricing([
      { job_id: "a", total_price: 100 },
      { job_id: "b", total_price: 0 },
      { job_id: "c", total_price: null },
    ]);
    expect(await countPricedCandidates(q([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]))).toBe(1);
  });

  it("is 0 with no candidates, and 0 (not a crash) if the query fails", async () => {
    expect(await countPricedCandidates(q([]))).toBe(0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await countPricedCandidates(q(null, { message: "boom" }))).toBe(0);
    warn.mockRestore();
  });
});

describe("MCP tools", () => {
  it("list_jobs takes total_price from job_pricing, null when there is no row", async () => {
    h.tables.jobs = { data: [{ id: "j1" }, { id: "j2" }], error: null };
    h.tables.job_pricing = pricing([{ job_id: "j1", total_price: 300 }]);
    const out: any = await (listJobsTool as any).handler({ status: "completed", limit: 5 }, ctx());
    expect(out.structuredContent.jobs).toEqual([
      { id: "j1", total_price: 300 },
      { id: "j2", total_price: null },
    ]);
  });

  it("list_jobs refuses when not signed in, reports a database error, and copes with no jobs", async () => {
    expect(((await (listJobsTool as any).handler({}, ctx(false))) as any).isError).toBe(true);
    h.tables.jobs = { data: null, error: { message: "nope" } };
    expect(((await (listJobsTool as any).handler({}, ctx())) as any).content[0].text).toBe("nope");
    h.tables.jobs = { data: [], error: null };
    expect(((await (listJobsTool as any).handler({}, ctx())) as any).structuredContent.jobs).toEqual([]);
  });

  it("get_job overlays the price from job_pricing", async () => {
    h.tables.jobs = { data: { id: "j1", total_price: null }, error: null };
    h.tables.job_pricing = { data: { total_price: 300 }, error: null };
    const out: any = await (getJobTool as any).handler({ id: "j1" }, ctx());
    expect(out.structuredContent.job.total_price).toBe(300);
  });

  it("get_job leaves the job alone when there is no pricing row, and handles errors / not found / signed out", async () => {
    h.tables.jobs = { data: { id: "j1", total_price: null }, error: null };
    h.tables.job_pricing = { data: null, error: null };
    expect(((await (getJobTool as any).handler({ id: "j1" }, ctx())) as any).structuredContent.job.total_price).toBeNull();
    h.tables.jobs = { data: null, error: null };
    expect(((await (getJobTool as any).handler({ id: "j1" }, ctx())) as any).isError).toBe(true);
    h.tables.jobs = { data: null, error: { message: "bad" } };
    expect(((await (getJobTool as any).handler({ id: "j1" }, ctx())) as any).content[0].text).toBe("bad");
    expect(((await (getJobTool as any).handler({ id: "j1" }, ctx(false))) as any).isError).toBe(true);
  });
});
