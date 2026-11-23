/** The Abort admin panel must not hide a failed replacement-job lookup. */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  replacementLookupError: "",
  rpcData: null as unknown,
  rpcError: null as { message: string; code?: string } | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
  push: vi.fn(),
  kick: vi.fn(),
}));

vi.mock("@/lib/pushApi", () => ({ notifyAbortRequested: mockState.push }));
vi.mock("@/lib/customerNotifyApi", () => ({ kickCustomerNotifications: mockState.kick }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string, args: unknown) => {
      mockState.rpcCalls.push({ fn, args });
      return { data: mockState.rpcData, error: mockState.rpcError };
    },
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: (_column: string, _value: unknown) => chain,
          order: (_column: string, _options?: unknown) => chain,
          limit: (_count: number) => chain,
          then: (resolve: (value: { data: unknown[]; error: { message: string } | null }) => unknown) =>
            Promise.resolve({
              data: [] as unknown[],
              error: table === "jobs" && mockState.replacementLookupError
                ? { message: mockState.replacementLookupError }
                : null,
            }).then(resolve),
        };
        return chain;
      },
    }),
  },
}));

import {
  getJobAbortState,
  requestJobAbort,
  confirmJobAbort,
  reviewAbortClaim,
  notifyCustomerAborted,
  createReplacementJob,
} from "@/features/abort/api/abortApi";

describe("getJobAbortState", () => {
  beforeEach(() => {
    mockState.replacementLookupError = "";
    mockState.rpcData = null;
    mockState.rpcError = null;
    mockState.rpcCalls.length = 0;
    mockState.push.mockReset();
    mockState.kick.mockReset();
  });

  it("returns an empty state when all data lookups succeed", async () => {
    const state = await getJobAbortState("job-1");
    expect(state.current).toBeNull();
    expect(state.pendingRequest).toBeNull();
    expect(state.replacementJobId).toBeNull();
    expect(state.invoiced).toBe(false);
  });

  it("does not misreport 'no replacement' when the lookup failed", async () => {
    mockState.replacementLookupError = "permission denied for replacement job";
    await expect(getJobAbortState("job-1")).rejects.toThrow(
      "Could not load the Abort: permission denied for replacement job",
    );
  });
});

describe("Abort RPC API contracts", () => {
  beforeEach(() => {
    mockState.rpcData = null;
    mockState.rpcError = null;
    mockState.rpcCalls.length = 0;
    mockState.push.mockReset();
    mockState.kick.mockReset();
  });

  it("requests an Abort using only the job ID and pushes only for a new request", async () => {
    mockState.rpcData = { requestId: "r1", requestedAt: "2026-11-23T15:00:00Z", duplicate: false };
    await requestJobAbort("job-1");
    expect(mockState.rpcCalls[0]).toEqual({ fn: "request_job_abort", args: { p_job_id: "job-1" } });
    expect(mockState.push).toHaveBeenCalledOnce();
    expect(mockState.push).toHaveBeenCalledWith("job-1");

    mockState.rpcData = { requestId: "r1", requestedAt: "2026-11-23T15:00:00Z", duplicate: true };
    await requestJobAbort("job-1");
    expect(mockState.push).toHaveBeenCalledOnce();
  });

  it("sends expected job-state, name and exception fields to the confirmation RPC", async () => {
    mockState.rpcData = { abortId: "a1", alreadyAborted: false, financeStatus: "pending_review" };
    await confirmJobAbort({ jobId: "j1", contactName: "Jane", noNameException: false, expectedStatus: "assigned" });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "confirm_job_abort",
      args: {
        p_job_id: "j1",
        p_contact_name: "Jane",
        p_no_name_exception: false,
        p_expected_status: "assigned",
      },
    });
  });

  it("preserves database error codes for a denied admin-only action", async () => {
    mockState.rpcError = { message: "ADMIN_OR_SUPER_ADMIN_ONLY", code: "42501" };
    await expect(confirmJobAbort({
      jobId: "j1", contactName: "Jane", noNameException: false, expectedStatus: "assigned",
    })).rejects.toMatchObject({ message: "ADMIN_OR_SUPER_ADMIN_ONLY", code: "42501" });
    expect(mockState.push).not.toHaveBeenCalled();
  });

  it("reviews the fee with approved amount and note unchanged", async () => {
    mockState.rpcData = { financeStatus: "approved", approvedAmount: 75 };
    await reviewAbortClaim({ abortId: "a1", decision: "approved", amount: 75, note: "Call-out fee" });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "review_job_abort_claim",
      args: { p_abort_id: "a1", p_decision: "approved", p_amount: 75, p_note: "Call-out fee" },
    });
  });

  it("starts customer email processing only when the admin RPC queues it", async () => {
    mockState.rpcData = { queued: true, alreadyQueued: false };
    await notifyCustomerAborted("a1");
    expect(mockState.kick).toHaveBeenCalledOnce();

    mockState.rpcData = { queued: false, alreadyQueued: true };
    await notifyCustomerAborted("a1");
    expect(mockState.kick).toHaveBeenCalledOnce();
  });

  it("rebooks via the dedicated RPC and does not modify the existing job client-side", async () => {
    mockState.rpcData = { jobId: "j2", jobRef: "AX-2", alreadyExists: false };
    const result = await createReplacementJob("j1");
    expect(result.jobId).toBe("j2");
    expect(mockState.rpcCalls[0]).toEqual({ fn: "create_abort_replacement_job", args: { p_job_id: "j1" } });
  });
});
