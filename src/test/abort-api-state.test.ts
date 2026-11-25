/** The Abort admin panel must not hide a failed replacement-job lookup. */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  replacementLookupError: "",
  invoiceLineRows: [] as Array<{ job_id: string | null }>,
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
      select: (columns?: string) => {
        const chain = {
          neq: (_column: string, _value: unknown) => chain,
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
              data: table === "invoice_items" && columns === "job_id"
                ? mockState.invoiceLineRows
                : mockState.tableRows[table] ?? [],
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
  getAbortInvoiceDetails,
  requestJobAbort,
  confirmJobAbort,
  reviewAbortClaim,
  amendApprovedAbortClaim,
  correctInvoicedAbortFee,
  notifyCustomerAborted,
  createReplacementJob,
  getPendingAbortRequest,
  listAbortQueue,
  getCurrentAbortsForJobs,
  dismissAbortRequest,
} from "@/features/abort/api/abortApi";

beforeEach(() => {
  mockState.replacementLookupError = "";
  mockState.invoiceLineRows = [];
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
    await reviewAbortClaim({ abortId: "a1", decision: "approved", amount: 75, note: "Call-out fee", clientConfirmed: true });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "review_job_abort_claim",
      args: { p_abort_id: "a1", p_decision: "approved", p_client_confirmed: true, p_amount: 75, p_note: "Call-out fee" },
    });
  });

  it("uses the dedicated amendment RPC with the old amount and mandatory reason", async () => {
    mockState.rpcData = { financeStatus: "approved", approvedAmount: 225, amendedAt: "2026-11-23T20:00:00Z" };
    await amendApprovedAbortClaim({
      abortId: "a1", newAmount: 225, expectedAmount: 240, clientConfirmed: true,
      reason: "Client confirmed a revised Abort fee",
    });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "amend_approved_job_abort_claim",
      args: {
        p_abort_id: "a1", p_new_amount: 225, p_expected_amount: 240,
        p_reason: "Client confirmed a revised Abort fee",
        p_client_confirmed: true,
      },
    });
  });

  it("corrects an invoiced fee by passing the expected amount, client agreement and full-credit acknowledgements", async () => {
    mockState.rpcData = {
      correctionId: "cor-1", creditNoteId: "cn-1", approvedAmount: 275,
      originalInvoiceNumber: "AX26-100", otherJobsToReinvoice: 2, originalWasPaid: true,
    };
    await correctInvoicedAbortFee({
      abortId: "a1", originalInvoiceId: "inv-1", newAmount: 275,
      expectedAmount: 240, reason: "Client confirmed a higher Abort fee",
      clientConfirmed: true, multiJobAcknowledged: true, paidAcknowledged: true, authoriseCredit: true,
    });
    expect(mockState.rpcCalls[0]).toEqual({
      fn: "correct_invoiced_job_abort_fee_authorised",
      args: {
        p_abort_id: "a1", p_original_invoice_id: "inv-1",
        p_new_amount: 275, p_expected_amount: 240,
        p_reason: "Client confirmed a higher Abort fee",
        p_client_confirmed: true, p_multi_job_acknowledged: true,
        p_paid_acknowledged: true,
        p_authorise_credit: true,
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
      args: { p_abort_id: "a1", p_decision: "rejected", p_client_confirmed: false, p_amount: undefined, p_note: undefined },
    });
  });
});

describe("Abort invoice correction history and active-invoice lookup", () => {
  const invoice = (id: string, status = "sent", total: string | null = "275") => ({
    id, invoice_number: "AX26-" + id, status, total, client_id: "c1", document_type: "invoice",
  });

  it("returns empty state without inventing a client invoice", async () => {
    await expect(getAbortInvoiceDetails("j1")).resolves.toEqual({
      activeInvoice: null, corrections: [],
    });
  });

  it("loads a multi-job issued invoice and distinct other jobs, converts historic numeric strings", async () => {
    mockState.tableRows.invoice_items = [
      { invoice_id: "inv1", invoices: invoice("inv1") },
    ];
    mockState.invoiceLineRows = [
      { job_id: "j1" }, { job_id: "other1" }, { job_id: "other1" }, { job_id: "other2" }, { job_id: null },
    ];
    mockState.tableRows.job_abort_invoice_corrections = [{
      id: "cor1", original_invoice_id: "original", credit_note_id: "cn1",
      replacement_invoice_id: "inv1", original_invoice_number: "AX26-OLD",
      previous_fee: "240.00", revised_fee: "275.00", other_jobs_on_invoice: 0,
      original_was_paid: false, reason: "Client confirmed different fee",
      created_at: "2026-11-23T20:00:00Z",
    }];
    const found = await getAbortInvoiceDetails("j1");
    expect(found.activeInvoice).toMatchObject({
      id: "inv1", status: "sent", total: 275, otherJobCount: 2,
    });
    expect(found.corrections[0]).toMatchObject({
      previous_fee: 240, revised_fee: 275, replacement_invoice_id: "inv1",
    });
  });

  it("recognises a paid legacy single-job invoice and omits cancelled invoices", async () => {
    mockState.tableRows.invoices = [invoice("legacy1", "paid", "240")];
    const found = await getAbortInvoiceDetails("j1");
    expect(found.activeInvoice).toMatchObject({
      id: "legacy1", status: "paid", otherJobCount: 0, total: 240,
    });
    mockState.tableRows.invoices = [invoice("legacy1", "cancelled", "240")];
    expect((await getAbortInvoiceDetails("j1")).activeInvoice).toBeNull();
  });

  it("ignores credit notes and voided or cancelled multi-job invoice joins", async () => {
    mockState.tableRows.invoice_items = [
      { invoice_id: "cn1", invoices: { ...invoice("cn1"), document_type: "credit_note" } },
      { invoice_id: "old1", invoices: invoice("old1", "cancelled") },
      { invoice_id: "missing", invoices: null },
    ];
    expect((await getAbortInvoiceDetails("j1")).activeInvoice).toBeNull();
  });

  it("refuses inconsistent invoices rather than crediting an arbitrary one", async () => {
    mockState.tableRows.invoice_items = [{ invoice_id: "inv1", invoices: invoice("inv1") }];
    mockState.tableRows.invoices = [invoice("legacy2")];
    await expect(getAbortInvoiceDetails("j1")).rejects.toThrow("Multiple active invoices");
  });

  it("fails closed when any invoice, history, or line-item query fails", async () => {
    mockState.tableErrors.invoice_items = "Invoice items inaccessible";
    await expect(getAbortInvoiceDetails("j1")).rejects.toThrow("Invoice items inaccessible");
    mockState.tableErrors.invoice_items = "";
    mockState.tableErrors.invoices = "Invoice header inaccessible";
    await expect(getAbortInvoiceDetails("j1")).rejects.toThrow("Invoice header inaccessible");
    mockState.tableErrors.invoices = "";
    mockState.tableErrors.job_abort_invoice_corrections = "History inaccessible";
    await expect(getAbortInvoiceDetails("j1")).rejects.toThrow("History inaccessible");
    mockState.tableErrors.job_abort_invoice_corrections = "";
    mockState.tableRows.invoices = [invoice("legacy")];
    mockState.tableErrors.invoice_items = "Invoice rows inaccessible";
    await expect(getAbortInvoiceDetails("j1")).rejects.toThrow("Invoice rows inaccessible");
  });

  it("preserves nullable totals and handles duplicate item rows for same invoice", async () => {
    mockState.tableRows.invoice_items = [
      { invoice_id: "inv1", invoices: invoice("inv1", "draft", null) },
      { invoice_id: "inv1", invoices: invoice("inv1", "draft", null) },
    ];
    expect((await getAbortInvoiceDetails("j1")).activeInvoice).toMatchObject({
      id: "inv1", total: null, otherJobCount: 0,
    });
  });
});
