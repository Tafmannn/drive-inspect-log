/* eslint-disable @typescript-eslint/no-explicit-any -- chainable database stub */
/**
 * Test data (is_test) stays out of the money screens: each hook below must ask the jobs table for
 * is_test = false. The database is a chainable stub that records every call; awaiting it gives an empty result.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const chain = (table: string): any => {
    const c: any = new Proxy(function () {}, {
      get: (_t, prop) =>
        prop === "then"
          ? (res: any, rej: any) => Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej)
          : (...args: unknown[]) => (calls.push({ table, method: String(prop), args }), c),
      apply: () => c,
    });
    return c;
  };
  return { calls, client: { from: (t: string) => chain(t), rpc: () => chain("rpc"), auth: { getUser: async () => ({ data: { user: null } }) } } };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.client }));
vi.mock("@/lib/evidenceAckApi", () => ({ listAcknowledgedEvidenceJobIds: async () => new Set<string>() }));
vi.mock("@/features/invoicing/api/createInvoice", () => ({ findAlreadyInvoicedJobs: async () => new Set<string>() }));

import { useProfitabilityData } from "@/features/control/hooks/useControlProfitabilityData";
import { useEligibleJobs } from "@/features/invoicing/hooks/useInvoicePrepData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { useAdminOperationsBuckets } from "@/hooks/useAdminOperationsBuckets";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const askedForLiveJobsOnly = () =>
  h.calls.some((c) => c.table === "jobs" && c.method === "eq" && c.args[0] === "is_test" && c.args[1] === false);

beforeEach(() => {
  h.calls.length = 0;
});

describe("money screens leave test data out of their jobs query", () => {
  it("Control profitability", async () => {
    renderHook(() => useProfitabilityData("30d"), { wrapper });
    await waitFor(() => expect(askedForLiveJobsOnly()).toBe(true));
  });

  it("Invoice Prep eligible jobs", async () => {
    const client = { id: "c1", org_id: "o1", name: "Acme", company: null, email: null, phone: null } as any;
    renderHook(() => useEligibleJobs(client), { wrapper });
    await waitFor(() => expect(askedForLiveJobsOnly()).toBe(true));
  });

  it("Attention Center billing checks", async () => {
    const filters = { severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "" } as any;
    renderHook(() => useAttentionData({ scope: "all", filters }), { wrapper });
    await waitFor(() => expect(askedForLiveJobsOnly()).toBe(true));
  });

  it("the ready-to-invoice count", async () => {
    renderHook(() => useAdminOperationsBuckets(), { wrapper });
    await waitFor(() => expect(askedForLiveJobsOnly()).toBe(true));
  });
});
