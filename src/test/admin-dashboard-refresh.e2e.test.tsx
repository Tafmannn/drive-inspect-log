/**
 * E2E refresh test — Admin dashboard reflects server state immediately
 * after an admin mutation event (pod_approved).
 *
 * Wires the actual Admin dashboard data hooks (`useAdminJobQueueKpis` and
 * `useAdminJobQueues`) to a real `QueryClient` backed by a mocked Supabase
 * client whose responses change between fetches. We then fire the same
 * invalidation event a real mutation would emit (`invalidateForEvent(qc,
 * "pod_approved")`) and assert that:
 *
 *   1. The "POD Review" KPI count drops.
 *   2. The job card that was in the `review` queue is gone.
 *   3. The job appears in the `completed` queue (server is the source of
 *      truth — no fake local-only removal).
 *
 * If the centralised invalidation list ever stops covering the admin
 * queue keys, this test fails — protecting the dashboard refresh chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import React from "react";

// ── Mock the Supabase client ────────────────────────────────────────
// We model a tiny chainable query builder that resolves with whatever
// `nextResponse` is currently configured. Each call shifts the queue.

type QueuedResponse = {
  data?: unknown;
  count?: number;
  error?: { message: string } | null;
};

const responseQueue: QueuedResponse[] = [];

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
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    // Allow `await builder` to resolve with the next queued response.
    then: (onFulfilled: (v: QueuedResponse) => unknown) => {
      const next = responseQueue.shift() ?? { data: [], count: 0, error: null };
      return Promise.resolve(next).then(onFulfilled);
    },
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeBuilder()),
  },
}));

// Imports MUST come after vi.mock so the hooks pick up the mocked client.
import {
  useAdminJobQueues,
  useAdminJobQueueKpis,
} from "@/hooks/useAdminJobQueues";
import { invalidateForEvent } from "@/lib/mutationEvents";

// ── Test fixtures ───────────────────────────────────────────────────

const recentIso = new Date(Date.now() - 60_000).toISOString(); // 1 min ago

const reviewJob = {
  id: "job-pod-1",
  external_job_number: "AX0042",
  vehicle_reg: "AB12 CDE",
  status: "pod_ready",
  driver_id: "drv-1",
  driver_name: "Alice",
  pickup_city: "London",
  pickup_postcode: "EC1A",
  delivery_city: "Leeds",
  delivery_postcode: "LS1",
  updated_at: recentIso,
  has_pickup_inspection: true,
  has_delivery_inspection: true,
  driver_profiles: { display_name: "Alice", full_name: "Alice Doe" },
};

const completedJob = {
  ...reviewJob,
  status: "completed",
  updated_at: new Date().toISOString(),
};

// ── Helpers ─────────────────────────────────────────────────────────

function queueInitialServerState() {
  // useAdminJobQueueKpis fires 4 count queries (active, podReview,
  // unassigned, stale) — POD review starts at 1.
  responseQueue.push(
    { count: 0, error: null }, // active
    { count: 1, error: null }, // podReview ← the one we'll clear
    { count: 0, error: null }, // unassigned
    { count: 0, error: null }, // stale
  );
  // useAdminJobQueues fires one list query.
  responseQueue.push({ data: [reviewJob], error: null });
}

function queueRefreshedServerState() {
  // After approval the POD count is 0, and the job has moved to completed.
  responseQueue.push(
    { count: 0, error: null }, // active
    { count: 0, error: null }, // podReview
    { count: 0, error: null }, // unassigned
    { count: 0, error: null }, // stale
  );
  responseQueue.push({ data: [completedJob], error: null });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ── Test ────────────────────────────────────────────────────────────

describe("Admin dashboard refresh after pod_approved", () => {
  beforeEach(() => {
    responseQueue.length = 0;
  });

  it("refreshes KPI counts and queue cards from server state", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = makeWrapper(qc);

    // Stage 1 — initial server state: 1 job in POD review.
    queueInitialServerState();

    const kpis = renderHook(() => useAdminJobQueueKpis(), { wrapper });
    const queues = renderHook(() => useAdminJobQueues(), { wrapper });

    await waitFor(() => {
      expect(kpis.result.current.data?.podReview).toBe(1);
      expect(queues.result.current.data?.review).toHaveLength(1);
    });
    expect(queues.result.current.data?.review[0].id).toBe("job-pod-1");
    expect(queues.result.current.data?.completed).toHaveLength(0);

    // Stage 2 — admin "approves" POD; queue the new server state, then
    // fire the same invalidation event the real mutation would emit.
    queueRefreshedServerState();

    await act(async () => {
      invalidateForEvent(qc, "pod_approved");
    });

    // Stage 3 — assertions: KPI count dropped, card removed from review,
    // and the job appears in completed (server-confirmed, not local-only).
    await waitFor(() => {
      expect(kpis.result.current.data?.podReview).toBe(0);
      expect(queues.result.current.data?.review).toHaveLength(0);
      expect(queues.result.current.data?.completed).toHaveLength(1);
      expect(queues.result.current.data?.completed[0].status).toBe(
        "completed",
      );
    });
  });
});
