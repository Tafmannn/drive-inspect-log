// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any -- chainable database stub */
/**
 * Data integrity of the Admin Home counts (useAdminOperationsBuckets,
 * useAdminJobQueueKpis):
 *   1. a failed query is `null` (unknown), never 0;
 *   2. id lists are paged past the 1,000-row cap;
 *   3. "completed, not invoiced" and "ready to invoice" exclude jobs that
 *      already have a non-cancelled invoice (duplicate-invoice guard), and
 *      fail closed when that lookup errors;
 *   4. failed_uploads is never reported as a number.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Res = { data?: unknown; count?: number | null; error: { message: string } | null };

const h = vi.hoisted(() => {
  const state = {
    /** completed/closed job ids returned by id-list queries on `jobs` */
    terminalIds: [] as string[],
    /** ids returned for the blocked-evidence query (uses .or) */
    blockedIds: [] as string[],
    jobsListError: null as null | { message: string },
    headCount: 0 as number,
    headError: null as null | { message: string },
    pricing: [] as { job_id: string; total_price: number | null }[],
    invoiceItems: [] as { job_id: string; voided?: boolean }[],
    legacyInvoices: [] as { job_id: string; status?: string }[],
    invoiceError: null as null | { message: string },
    rangesAsked: [] as [number, number][],
  };
  function builder(table: string) {
    const q: any = { table, head: false, isOr: false, inArgs: null as null | unknown[], range: null as null | [number, number] };
    const self: any = {
      select: (_c: string, o?: { head?: boolean }) => ((q.head = !!o?.head), self),
      eq: () => self, not: () => self, is: () => self, gte: () => self, lt: () => self, gt: () => self,
      order: () => self, limit: () => self,
      or: () => ((q.isOr = true), self),
      in: (_col: string, vals: unknown[]) => ((q.inArgs = vals), self),
      range: (a: number, b: number) => ((q.range = [a, b]), state.rangesAsked.push([a, b]), self),
      then: (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve(q)).then(ok, bad),
    };
    return self;
  }
  function page(ids: string[], r: [number, number] | null) {
    const [a, b] = r ?? [0, ids.length - 1];
    return ids.slice(a, b + 1).map((id) => ({ id }));
  }
  function resolve(q: any): Res {
    const inSet = new Set((q.inArgs ?? []) as string[]);
    switch (q.table) {
      case "jobs":
        if (q.head) return { count: state.headError ? null : state.headCount, error: state.headError };
        if (state.jobsListError) return { data: null, error: state.jobsListError };
        return { data: page(q.isOr ? state.blockedIds : state.terminalIds, q.range), error: null };
      case "job_pricing":
        return { data: state.pricing.filter((p) => inSet.has(p.job_id)), error: null };
      case "invoice_items":
        return { data: state.invoiceItems.filter((p) => inSet.has(p.job_id)), error: state.invoiceError };
      case "invoices":
        return { data: state.legacyInvoices.filter((p) => inSet.has(p.job_id)), error: null };
      default:
        return { data: [], error: null };
    }
  }
  return { state, client: { from: (t: string) => builder(t) } };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.client }));
vi.mock("@/lib/evidenceAckApi", () => ({ listAcknowledgedEvidenceJobIds: async () => new Set<string>() }));

import { useAdminOperationsBuckets, ID_PAGE_SIZE } from "@/hooks/useAdminOperationsBuckets";
import { useAdminJobQueueKpis } from "@/hooks/useAdminJobQueues";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function buckets() {
  const { result } = renderHook(() => useAdminOperationsBuckets(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data!;
}

const ids = (n: number, p = "j") => Array.from({ length: n }, (_, i) => `${p}${i}`);

beforeEach(() => {
  Object.assign(h.state, {
    terminalIds: [], blockedIds: [], jobsListError: null, headCount: 0, headError: null,
    pricing: [], invoiceItems: [], legacyInvoices: [], invoiceError: null, rangesAsked: [],
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Admin Home bucket counts", () => {
  it("excludes jobs that already have a non-cancelled invoice", async () => {
    h.state.terminalIds = ["a", "b", "c", "d"];
    h.state.pricing = ["a", "b", "c", "d"].map((job_id) => ({ job_id, total_price: 100 }));
    h.state.invoiceItems = [{ job_id: "a" }, { job_id: "b", voided: true }]; // b's invoice was cancelled
    h.state.legacyInvoices = [{ job_id: "c", status: "sent" }, { job_id: "d", status: "cancelled" }];
    const b = await buckets();
    // a (item) and c (legacy) are invoiced; b (voided) and d (cancelled) are not.
    expect(b.completed_not_invoiced).toBe(2);
    expect(b.ready_to_invoice).toBe(2);
  });

  it("ready to invoice still requires a price above zero", async () => {
    h.state.terminalIds = ["a", "b", "c"];
    h.state.pricing = [{ job_id: "a", total_price: 50 }, { job_id: "b", total_price: 0 }];
    const b = await buckets();
    expect(b.ready_to_invoice).toBe(1);
    expect(b.completed_not_invoiced).toBe(3);
  });

  it("counts past the 1,000-row cap by paging", async () => {
    h.state.terminalIds = ids(ID_PAGE_SIZE * 2 + 5);
    const b = await buckets();
    expect(b.completed_not_invoiced).toBe(ID_PAGE_SIZE * 2 + 5);
    expect(h.state.rangesAsked).toContainEqual([ID_PAGE_SIZE * 2, ID_PAGE_SIZE * 3 - 1]);
  });

  it("fails closed: an invoice lookup error makes both invoicing buckets unknown", async () => {
    h.state.terminalIds = ["a", "b"];
    h.state.pricing = [{ job_id: "a", total_price: 10 }, { job_id: "b", total_price: 10 }];
    h.state.invoiceError = { message: "permission denied" };
    const b = await buckets();
    expect(b.completed_not_invoiced).toBeNull();
    expect(b.ready_to_invoice).toBeNull();
  });

  it("a failed count is null, never 0, and ready-to-close follows its inputs", async () => {
    h.state.headError = { message: "timeout" };
    h.state.jobsListError = { message: "timeout" };
    const b = await buckets();
    expect(b.todays_active).toBeNull();
    expect(b.needs_admin_review).toBeNull();
    expect(b.blocked_evidence).toBeNull();
    expect(b.ready_to_close).toBeNull();
    expect(b.completed_not_invoiced).toBeNull();
  });

  it("never reports failed uploads as a number", async () => {
    const b = await buckets();
    expect(b.failed_uploads).toBeNull();
  });

  it("still returns real zeros when the queries succeed and nothing matches", async () => {
    const b = await buckets();
    expect(b.todays_active).toBe(0);
    expect(b.completed_not_invoiced).toBe(0);
    expect(b.ready_to_invoice).toBe(0);
    expect(b.ready_to_close).toBe(0);
  });
});

describe("Admin Home KPI counts", () => {
  it("a failed count is null, not 0", async () => {
    h.state.headError = { message: "timeout" };
    const { result } = renderHook(() => useAdminJobQueueKpis(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ active: null, podReview: null, unassigned: null, stale: null });
  });

  it("returns the counts when the queries succeed", async () => {
    h.state.headCount = 7;
    const { result } = renderHook(() => useAdminJobQueueKpis(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ active: 7, podReview: 7, unassigned: 7, stale: 7 });
  });
});
