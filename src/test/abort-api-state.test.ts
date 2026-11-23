/** The Abort admin panel must not hide a failed replacement-job lookup. */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  replacementLookupError: "",
  tableRows: {} as Record<string, unknown[]>,
  tableErrors: {} as Record<string, string>,
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
          in: (_column: string, _values: unknown[]) => chain,
          is: (_column: string, _value: unknown) => chain,
          maybeSingle: async () => ({
            data: mockState.tableRows[table]?.[0] ?? null,
            error: mockState.tableErrors[table]
              ? { message: mockState.tableErrors[table] }
              : null,
          }),
          then: (resolve: (value: { data: unknown[]; error: { message: string } | null }) => unknown) =>
            Promise.resolve({
              data: mockState.tableRows[table] ?? [],
              error: table === "jobs" && mockState.replacementLookupError
                ? { message: mockState.replacementLookupError }
                : mockState.tableErrors[table]
                  ? { message: mockState.tableErrors[table] }
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
  amendApprovedAbortClaim,
  notifyCustomerAborted,
  createReplacementJob,
  getPendingAbortRequest,
  listAbortQueue,
  getCurrentAbortsForJobs,
  dismissAbortRequest,
} from "@/features/abort/api/abortApi";

beforeEach(() => {
  mockState.replacementLookupError = "";
  mockState.tableRows = {};
  mockState.tableErrors = {};
});

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

  it("maps the no-name exception to a valid typed RPC payload", async () => {
    mockState.rpcData = { abortId: "a2", alreadyAborted: false, financeStatus: "pending_review" };
    await confirmJobAbort({ jobId: "j1", contactName: null, noNameException: true, expectedStatus: "assigned" });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "confirm_job_abort",
      args: {
        p_job_id: "j1",
        p_contact_name: "",
        p_no_name_exception: true,
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

  it("uses the dedicated amendment RPC with the old amount and mandatory reason", async () => {
    mockState.rpcData = { financeStatus: "approved", approvedAmount: 225, amendedAt: "2026-11-23T20:00:00Z" };
    await amendApprovedAbortClaim({
      abortId: "a1", newAmount: 225, expectedAmount: 240,
      reason: "Client confirmed a revised Abort fee",
    });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "amend_approved_job_abort_claim",
      args: {
        p_abort_id: "a1", p_new_amount: 225, p_expected_amount: 240,
        p_reason: "Client confirmed a revised Abort fee",
      },
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

describe("Abort table queries", () => {
  it("loads the requesting driver's pending Abort and reports lookup failures", async () => {
    mockState.tableRows.job_abort_requests = [{
      id: "r1", job_id: "j1", driver_id: "d1", run_id: null,
      requested_at: "2026-11-23T12:00:00Z", status: "pending", resolved_at: null, resolution_note: null,
    }];
    expect((await getPendingAbortRequest("j1"))?.id).toBe("r1");

    mockState.tableErrors.job_abort_requests = "RLS denied";
    await expect(getPendingAbortRequest("j1")).rejects.toThrow("RLS denied");
  });

  it("does not confuse an empty Abort queue with a query failure", async () => {
    await expect(listAbortQueue()).resolves.toEqual([]);
    mockState.tableErrors.job_aborts = "database unavailable";
    await expect(listAbortQueue()).rejects.toThrow("Could not load Aborts: database unavailable");
  });

  it("loads Abort fees and converts Postgres numeric strings to numbers", async () => {
    mockState.tableRows.job_aborts = [{
      id: "a1", job_id: "j1", confirmed_at: "2026-11-23T12:00:00Z",
      agreed_price: "250.50", proposed_amount: "250.50", approved_amount: "75.25",
      finance_status: "approved", reopened_at: null,
    }];
    const rows = await getCurrentAbortsForJobs(["j1"]);
    expect(rows.get("j1")?.approved_amount).toBe(75.25);
    expect(rows.get("j1")?.agreed_price).toBe(250.50);
    expect(await getCurrentAbortsForJobs([])).toEqual(new Map());
  });

  it("shows only current non-test Aborts and pending requests in the admin queue", async () => {
    mockState.tableRows.job_abort_requests = [{
      id: "r1", job_id: "j1", requested_at: "2026-11-23T11:00:00Z",
      status: "pending",
    }];
    mockState.tableRows.job_aborts = [{
      id: "a1", job_id: "j1", confirmed_at: "2026-11-23T12:00:00Z",
      agreed_price: null, proposed_amount: null, approved_amount: null,
      finance_status: "pending_review", reopened_at: null,
    }];
    mockState.tableRows.jobs = [{
      id: "j1", external_job_number: "AX-1", vehicle_reg: "AB12 CDE",
      client_company: "Acme", client_name: "Acme", status: "aborted", is_test: false,
    }];
    const rows = await listAbortQueue();
    expect(rows.map((r) => r.kind)).toEqual(["request", "abort"]);
    expect(rows[1].abort?.finance_status).toBe("pending_review");
  });
});

describe("optional Abort RPC fields", () => {
  beforeEach(() => {
    mockState.rpcData = { status: "dismissed" };
    mockState.rpcError = null;
    mockState.rpcCalls.length = 0;
  });

  it("lets admins dismiss a request without a note", async () => {
    await dismissAbortRequest("r1");
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "dismiss_job_abort_request",
      args: { p_request_id: "r1", p_note: undefined },
    });
  });

  it("allows an approval RPC to omit amount and reason for explicit server validation", async () => {
    mockState.rpcData = { financeStatus: "rejected", approvedAmount: null };
    await reviewAbortClaim({ abortId: "a1", decision: "rejected" });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "review_job_abort_claim",
      args: { p_abort_id: "a1", p_decision: "rejected", p_amount: undefined, p_note: undefined },
    });
  });
});
