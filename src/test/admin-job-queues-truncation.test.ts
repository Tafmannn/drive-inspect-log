/**
 * `useAdminJobQueues` fetches all non-hidden jobs in one query, ordered
 * most-recently-updated first, capped at 300. If a workspace ever has more
 * than 300 non-hidden jobs, the oldest — exactly the stale/unassigned/review
 * jobs these queues exist to surface — are silently dropped, even though the
 * KPI tiles (separate, unlimited counts) stay accurate. The `truncated` flag
 * lets the UI warn instead of quietly under-reporting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

let mockJobs: any[] = [];

function makeBuilder() {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    like: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (onFulfilled: (v: any) => unknown) =>
      Promise.resolve({ data: mockJobs, error: null }).then(onFulfilled),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => makeBuilder()) },
}));

import { useAdminJobQueues } from "@/hooks/useAdminJobQueues";

function job(i: number): any {
  return {
    id: `job-${i}`,
    external_job_number: `AX${i}`,
    vehicle_reg: "AB12 CDE",
    status: "pod_ready",
    driver_id: null,
    driver_name: null,
    pickup_city: "London",
    pickup_postcode: "EC1A",
    delivery_city: "Leeds",
    delivery_postcode: "LS1",
    updated_at: new Date().toISOString(),
    has_pickup_inspection: true,
    has_delivery_inspection: true,
    driver_profiles: null,
  };
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("useAdminJobQueues truncation flag", () => {
  beforeEach(() => {
    mockJobs = [];
  });

  it("flags truncated=true when the fetch hits the 300-row cap", async () => {
    mockJobs = Array.from({ length: 300 }, (_, i) => job(i));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useAdminJobQueues(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.truncated).toBe(true);
  });

  it("flags truncated=false when the fetch returns fewer than 300 rows", async () => {
    mockJobs = Array.from({ length: 5 }, (_, i) => job(i));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useAdminJobQueues(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.truncated).toBe(false);
  });
});
