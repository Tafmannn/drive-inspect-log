/**
 * Attention Center data helpers: evidence lookups stay scoped to the jobs
 * asked about (and never include archived inspections), driver names resolve
 * only for driver documents, and filters narrow — never widen — what is shown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionException, AttentionFiltersState } from "@/features/attention/types/exceptionTypes";

const h = vi.hoisted(() => ({
  calls: [] as { table: string; select: string; in?: [string, string[]]; is?: [string, unknown] }[],
  rows: {} as Record<string, unknown[]>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const call: (typeof h.calls)[number] = { table, select: "" };
    h.calls.push(call);
    const builder = {
      select(cols: string) { call.select = cols; return builder; },
      in(col: string, ids: string[]) {
        call.in = [col, ids];
        const result = { data: (h.rows[table] ?? []).filter((r) => ids.includes((r as Record<string, string>)[col === "job_id" ? "job_id" : "id"])), error: null };
        return Object.assign(Promise.resolve(result), {
          is(c: string, v: unknown) { call.is = [c, v]; return Promise.resolve(result); },
        });
      },
    };
    return builder;
  };
  return { supabase: { from } };
});

import { filterExceptions, loadDriverLookups, loadInspections } from "@/features/attention/hooks/useAttentionData";

beforeEach(() => {
  h.calls = [];
  h.rows = {};
});

describe("loadInspections", () => {
  it("makes no request when there are no completed jobs", async () => {
    expect(await loadInspections([])).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("queries in chunks of 100 job IDs and excludes archived inspections", async () => {
    const jobs = Array.from({ length: 205 }, (_, i) => ({ id: `job-${i}` })) as never[];
    h.rows.inspections = [
      { id: "i1", job_id: "job-0", org_id: "A" },
      { id: "i2", job_id: "job-150", org_id: "A" },
      { id: "i3", job_id: "job-204", org_id: "A" },
    ];
    const result = await loadInspections(jobs);
    expect(h.calls.map((c) => c.in?.[1].length)).toEqual([100, 100, 5]);
    expect(h.calls.every((c) => c.table === "inspections" && c.is?.[0] === "archived_at" && c.is?.[1] === null)).toBe(true);
    expect(h.calls[0].select).toContain("org_id");
    expect(result.map((r: { id: string }) => r.id)).toEqual(["i1", "i2", "i3"]);
  });
});

describe("loadDriverLookups", () => {
  it("does not query driver profiles when no document belongs to a driver", async () => {
    const out = await loadDriverLookups([{ related_type: "vehicle", related_id: "v1" }]);
    expect(h.calls).toHaveLength(0);
    expect(out.driverNameByProfileId.size).toBe(0);
  });

  it("resolves names and user IDs once per distinct driver profile", async () => {
    h.rows.driver_profiles = [
      { id: "dp1", user_id: "u1", full_name: "Sam Driver" },
      { id: "dp2", user_id: null, full_name: null },
    ];
    const out = await loadDriverLookups([
      { related_type: "driver", related_id: "dp1" },
      { related_type: "driver", related_id: "dp1" },
      { related_type: "driver", related_id: "dp2" },
      { related_type: "vehicle", related_id: "v9" },
    ]);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].in).toEqual(["id", ["dp1", "dp2"]]);
    expect(out.driverNameByProfileId.get("dp1")).toBe("Sam Driver");
    expect(out.driverUserIdByProfileId.get("dp1")).toBe("u1");
    expect(out.driverNameByProfileId.has("dp2")).toBe(false);
    expect(out.driverUserIdByProfileId.has("dp2")).toBe(false);
  });
});

describe("filterExceptions", () => {
  const ex = (over: Partial<AttentionException>): AttentionException => ({
    id: "x", orgId: "A", jobId: "j", category: "evidence", severity: "high", title: "t", detail: "d",
    createdAt: "2026-11-20T10:00:00", actionLabel: "Open", actionRoute: "/", ...over,
  });
  const all: AttentionFiltersState = { severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "" };
  const list = [
    ex({ id: "1", severity: "critical", category: "billing", orgId: "A", createdAt: "2026-11-18T09:00:00" }),
    ex({ id: "2", severity: "high", category: "evidence", orgId: "B", createdAt: "2026-11-20T23:30:00" }),
    ex({ id: "3", severity: "high", category: "billing", orgId: "B", createdAt: "2026-11-22T08:00:00" }),
  ];
  const ids = (xs: AttentionException[]) => xs.map((x) => x.id);

  it("returns everything when no filter is set", () => {
    expect(ids(filterExceptions(list, all, "all"))).toEqual(["1", "2", "3"]);
  });
  it("filters by severity and category together", () => {
    expect(ids(filterExceptions(list, { ...all, severity: "high", category: "billing" }, "all"))).toEqual(["3"]);
  });
  it("applies the organisation filter only on the platform-wide view", () => {
    expect(ids(filterExceptions(list, { ...all, orgId: "B" }, "all"))).toEqual(["2", "3"]);
    expect(ids(filterExceptions(list, { ...all, orgId: "B" }, "org"))).toEqual(["1", "2", "3"]);
  });
  it("treats the end date as inclusive of the whole day", () => {
    expect(ids(filterExceptions(list, { ...all, dateFrom: "2026-11-19", dateTo: "2026-11-20" }, "all"))).toEqual(["2"]);
  });
});
