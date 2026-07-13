import { describe, it, expect, vi, beforeEach } from "vitest";

// WORKFLOW-008: two parallel invoicing paths exist — the multi-job flow
// (InvoicePrepScreen -> createMultiJobInvoice), which links a job via a row
// in invoice_items, and the legacy single-job flow (InvoiceGenerator.tsx,
// reachable from PodReport's "Create Invoice" button), which writes
// invoices.job_id directly and never touches invoice_items at all. Before
// this fix, each flow's "already invoiced?" check only looked at its own
// storage location, so a job invoiced through one path was invisible to the
// other's duplicate guard — the same job could be billed twice.
const mockInvoiceItemsIn = vi.fn();
const mockInvoicesIn = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "invoice_items") {
        return { select: () => ({ in: (...a: unknown[]) => mockInvoiceItemsIn(...a) }) };
      }
      if (table === "invoices") {
        return { select: () => ({ in: (...a: unknown[]) => mockInvoicesIn(...a) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { findAlreadyInvoicedJobs } from "@/features/invoicing/api/createInvoice";

beforeEach(() => {
  mockInvoiceItemsIn.mockReset();
  mockInvoicesIn.mockReset();
});

describe("findAlreadyInvoicedJobs (WORKFLOW-008)", () => {
  it("detects a job invoiced via the multi-job flow (invoice_items row)", async () => {
    mockInvoiceItemsIn.mockResolvedValue({ data: [{ job_id: "job-1" }], error: null });
    mockInvoicesIn.mockResolvedValue({ data: [], error: null });

    const result = await findAlreadyInvoicedJobs(["job-1", "job-2"]);
    expect(result.has("job-1")).toBe(true);
    expect(result.has("job-2")).toBe(false);
  });

  it("detects a job invoiced via the legacy single-job flow (invoices.job_id, no invoice_items row)", async () => {
    mockInvoiceItemsIn.mockResolvedValue({ data: [], error: null });
    mockInvoicesIn.mockResolvedValue({ data: [{ job_id: "job-1" }], error: null });

    const result = await findAlreadyInvoicedJobs(["job-1", "job-2"]);
    expect(result.has("job-1")).toBe(true);
    expect(result.has("job-2")).toBe(false);
  });

  it("unions both sources when a job somehow appears in both", async () => {
    mockInvoiceItemsIn.mockResolvedValue({ data: [{ job_id: "job-1" }], error: null });
    mockInvoicesIn.mockResolvedValue({ data: [{ job_id: "job-1" }, { job_id: "job-3" }], error: null });

    const result = await findAlreadyInvoicedJobs(["job-1", "job-2", "job-3"]);
    expect(result.has("job-1")).toBe(true);
    expect(result.has("job-3")).toBe(true);
    expect(result.has("job-2")).toBe(false);
  });

  it("returns an empty set without querying when given no job ids", async () => {
    const result = await findAlreadyInvoicedJobs([]);
    expect(result.size).toBe(0);
    expect(mockInvoiceItemsIn).not.toHaveBeenCalled();
    expect(mockInvoicesIn).not.toHaveBeenCalled();
  });
});
