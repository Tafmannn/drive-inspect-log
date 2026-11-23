/** Abort fee approval must lock the job cache immediately after the server commits. */
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JobAbort, JobAbortState } from "@/features/abort/api/abortApi";
import { abortKeys, useAmendApprovedAbortClaim, useReviewAbortClaim } from "@/features/abort/hooks/useAbort";

const calls = vi.hoisted(() => ({
  review: vi.fn(),
  amend: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/features/abort/api/abortApi", () => ({
  reviewAbortClaim: calls.review,
  amendApprovedAbortClaim: calls.amend,
  requestJobAbort: vi.fn(),
  dismissAbortRequest: vi.fn(),
  confirmJobAbort: vi.fn(),
  getPendingAbortRequest: vi.fn(),
  getJobAbortState: vi.fn(),
  listAbortQueue: vi.fn(),
  notifyCustomerAborted: vi.fn(),
  createReplacementJob: vi.fn(),
}));
vi.mock("@/lib/mutationEvents", () => ({ invalidateForEvent: calls.invalidate }));

const approvedAt = "2026-11-23T20:10:00Z";
const current = {
  id: "abort-1",
  job_id: "job-1",
  finance_status: "pending_review",
  approved_amount: null,
  reviewed_at: null,
  review_note: null,
  reviewed_by: null,
  last_amended_at: null,
  last_amended_by: null,
  last_amendment_reason: null,
} as unknown as JobAbort;

function state(abort: JobAbort): JobAbortState {
  return {
    current: abort,
    history: [abort],
    pendingRequest: null,
    events: [],
    invoiced: false,
    paid: false,
    replacementJobId: null,
  };
}

function setup(initial?: JobAbortState) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  if (initial) queryClient.setQueryData(abortKeys.job("job-1"), initial);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  calls.review.mockReset();
  calls.amend.mockReset();
  calls.invalidate.mockReset();
});

describe("Abort fee React Query cache locks", () => {
  it("replaces pending review with approved fee in both current and history", async () => {
    calls.review.mockResolvedValue({ financeStatus: "approved", approvedAmount: 240 });
    const { queryClient, wrapper } = setup(state(current));
    const { result } = renderHook(() => useReviewAbortClaim("job-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        abortId: "abort-1", decision: "approved", amount: 240, note: null,
      });
    });

    const cached = queryClient.getQueryData<JobAbortState>(abortKeys.job("job-1"));
    expect(cached?.current?.finance_status).toBe("approved");
    expect(cached?.current?.approved_amount).toBe(240);
    expect(cached?.history[0].approved_amount).toBe(240);
    expect(calls.review).toHaveBeenCalledTimes(1);
    expect(calls.invalidate).toHaveBeenCalledWith(
      queryClient, "job_status_changed", [["job", "job-1"], ["invoice-prep-eligible"]],
    );
  });

  it("locks a rejected fee as rejected with no chargeable amount", async () => {
    calls.review.mockResolvedValue({ financeStatus: "rejected", approvedAmount: null });
    const { queryClient, wrapper } = setup(state(current));
    const { result } = renderHook(() => useReviewAbortClaim("job-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ abortId: "abort-1", decision: "rejected" });
    });

    expect(queryClient.getQueryData<JobAbortState>(abortKeys.job("job-1"))?.current?.finance_status).toBe("rejected");
    expect(queryClient.getQueryData<JobAbortState>(abortKeys.job("job-1"))?.history[0].approved_amount).toBeNull();
  });

  it("does not replace data when the response refers to a different Abort", async () => {
    calls.review.mockResolvedValue({ financeStatus: "approved", approvedAmount: 100 });
    const existing = state(current);
    const { queryClient, wrapper } = setup(existing);
    const { result } = renderHook(() => useReviewAbortClaim("job-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ abortId: "abort-other", decision: "approved", amount: 100 });
    });

    expect(queryClient.getQueryData(abortKeys.job("job-1"))).toEqual(existing);
  });

  it("handles an unloaded job without inventing a successful cached approval", async () => {
    calls.review.mockResolvedValue({ financeStatus: "approved", approvedAmount: 240 });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useReviewAbortClaim("job-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ abortId: "abort-1", decision: "approved", amount: 240 });
    });

    expect(queryClient.getQueryData(abortKeys.job("job-1"))).toBeUndefined();
  });

  it("amends only the approved fee and retains the original review data", async () => {
    const old: JobAbort = {
      ...current, finance_status: "approved", approved_amount: 240,
      reviewed_by: "admin-1", reviewed_at: approvedAt, review_note: "Client authorised £240",
    };
    calls.amend.mockResolvedValue({
      financeStatus: "approved", approvedAmount: 210, amendedAt: "2026-11-23T21:00:00Z",
    });
    const { queryClient, wrapper } = setup(state(old));
    const { result } = renderHook(() => useAmendApprovedAbortClaim("job-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        abortId: "abort-1", newAmount: 210, expectedAmount: 240,
        reason: "Client revised the fee after confirmation",
      });
    });

    const cached = queryClient.getQueryData<JobAbortState>(abortKeys.job("job-1"));
    expect(cached?.current?.approved_amount).toBe(210);
    expect(cached?.history[0].approved_amount).toBe(210);
    expect(cached?.current?.reviewed_by).toBe("admin-1");
    expect(cached?.current?.reviewed_at).toBe(approvedAt);
    expect(cached?.current?.review_note).toBe("Client authorised £240");
    expect(cached?.current?.last_amended_at).toBe("2026-11-23T21:00:00Z");
    expect(cached?.current?.last_amendment_reason).toBe("Client revised the fee after confirmation");
  });

  it("does not overwrite another Abort or change the cache after a failed amendment", async () => {
    calls.amend.mockResolvedValue({ approvedAmount: 180, amendedAt: "2026-11-23T21:00:00Z" });
    const old = state({ ...current, finance_status: "approved", approved_amount: 240 });
    const { queryClient, wrapper } = setup(old);
    const { result } = renderHook(() => useAmendApprovedAbortClaim("job-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        abortId: "abort-other", newAmount: 180, expectedAmount: 240, reason: "Client revised the fee",
      });
    });
    expect(queryClient.getQueryData(abortKeys.job("job-1"))).toEqual(old);

    calls.amend.mockRejectedValue(new Error("ABORT_FEE_CHANGED"));
    await act(async () => {
      await expect(result.current.mutateAsync({
        abortId: "abort-1", newAmount: 180, expectedAmount: 240, reason: "Another client confirmation",
      })).rejects.toThrow("ABORT_FEE_CHANGED");
    });
    expect(queryClient.getQueryData(abortKeys.job("job-1"))).toEqual(old);
  });
});
