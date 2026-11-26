import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Invoice lifecycle actions against a mocked Supabase: what is written, in
 * what order, and that the guards on each transition hold.
 */
const h = vi.hoisted(() => ({
  updates: [] as { values: Record<string, unknown>; filters: [string, unknown][] }[],
  updateResult: { data: [{ id: "inv-1" }], error: null } as { data: unknown; error: { message: string } | null },
  upload: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  download: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  rpc: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  generate: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  order: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  function updateChain(values: Record<string, unknown>) {
    const entry = { values, filters: [] as [string, unknown][] };
    h.updates.push(entry);
    h.order.push("update:" + Object.keys(values).sort((a, b) => a.localeCompare(b)).join(","));
    const chain = {
      eq(col: string, val: unknown) {
        entry.filters.push([col, val]);
        return chain;
      },
      select() {
        return Promise.resolve(h.updateResult);
      },
      then(res: (v: unknown) => unknown) {
        return Promise.resolve({ error: h.updateResult.error }).then(res);
      },
    };
    return chain;
  }
  return {
    supabase: {
      from: () => ({ update: updateChain }),
      rpc: (...a: unknown[]) => h.rpc(...a),
      storage: {
        from: () => ({
          upload: (...a: unknown[]) => {
            h.order.push("upload");
            return h.upload(...a);
          },
          download: (...a: unknown[]) => h.download(...a),
        }),
      },
    },
  };
});

vi.mock("@/features/invoicing/api/invoiceDocument", () => ({
  generateInvoiceDocumentPdf: (...a: unknown[]) => {
    h.order.push("render");
    return h.generate(...a);
  },
}));

import {
  cancelInvoice,
  freezeInvoicePdf,
  getInvoicePdf,
  invoicePdfPath,
  markInvoicePaid,
  markInvoiceSent,
  markInvoiceUnpaid,
  storeInvoicePdf,
} from "@/features/invoicing/api/invoiceLifecycle";
import type { InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";

const pdf = new Blob(["pdf"], { type: "application/pdf" });

function record(over: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv-1", invoice_number: "AX26-1007", client_name: "Chris", client_company: "CJE", client_email: null,
    client_address: null, issue_date: "2026-11-14", due_date: null, payment_terms: null, line_items: [],
    subtotal: 100, vat_rate: 0, vat_amount: 0, total: 100, notes: null, status: "draft", created_at: "2026-11-14",
    ...over,
  };
}

beforeEach(() => {
  h.updates = [];
  h.order = [];
  h.updateResult = { data: [{ id: "inv-1" }], error: null };
  h.upload = vi.fn().mockResolvedValue({ error: null });
  h.download = vi.fn().mockResolvedValue({ data: pdf, error: null });
  h.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  h.generate = vi.fn().mockResolvedValue(pdf);
});

describe("storing the invoice PDF", () => {
  it("uses an org-scoped, deterministic path for invoices and credit notes", () => {
    expect(invoicePdfPath("org-1", "AX26-1007")).toBe("org-1/AXENTRA_INV_AX26-1007.pdf");
    expect(invoicePdfPath("org-1", "CN26-0001")).toBe("org-1/AXENTRA_CN_CN26-0001.pdf");
  });

  it("uploads with upsert and returns the path", async () => {
    await expect(storeInvoicePdf("org-1", "AX26-1007", pdf)).resolves.toBe("org-1/AXENTRA_INV_AX26-1007.pdf");
    expect(h.upload).toHaveBeenCalledWith("org-1/AXENTRA_INV_AX26-1007.pdf", pdf, { contentType: "application/pdf", upsert: true });
  });

  it("surfaces an upload failure", async () => {
    h.upload.mockResolvedValue({ error: { message: "quota exceeded" } });
    await expect(storeInvoicePdf("org-1", "AX26-1007", pdf)).rejects.toThrow(/quota exceeded/);
  });

  it("freezeInvoicePdf always re-renders, even when a draft already has a stored copy", async () => {
    const path = await freezeInvoicePdf(record({ pdf_url: "org-1/old.pdf" }), "org-1", null);
    expect(path).toBe("org-1/AXENTRA_INV_AX26-1007.pdf");
    expect(h.order).toEqual(["render", "upload", "update:pdf_url"]);
    expect(h.updates[0]).toEqual({ values: { pdf_url: path }, filters: [["id", "inv-1"]] });
  });

  it("freezeInvoicePdf fails if the path cannot be recorded", async () => {
    h.updateResult = { data: null, error: { message: "denied" } };
    await expect(freezeInvoicePdf(record(), "org-1", null)).rejects.toThrow(/Could not record the stored invoice PDF: denied/);
  });
});

describe("getInvoicePdf", () => {
  it("renders a draft fresh, never serving a stored copy", async () => {
    await getInvoicePdf(record({ status: "draft", pdf_url: "org-1/x.pdf" }));
    expect(h.download).not.toHaveBeenCalled();
    expect(h.generate).toHaveBeenCalled();
  });

  it("serves the stored file for an issued invoice", async () => {
    const blob = await getInvoicePdf(record({ status: "sent", pdf_url: "org-1/x.pdf" }));
    expect(h.download).toHaveBeenCalledWith("org-1/x.pdf");
    expect(h.generate).not.toHaveBeenCalled();
    expect(blob).toBe(pdf);
  });

  it("falls back to re-rendering when the stored file cannot be read", async () => {
    h.download.mockResolvedValue({ data: null, error: { message: "not found" } });
    await getInvoicePdf(record({ status: "paid", pdf_url: "org-1/x.pdf" }));
    expect(h.generate).toHaveBeenCalled();
  });

  it("renders an issued invoice that has no stored copy (issued before PDFs were stored)", async () => {
    await getInvoicePdf(record({ status: "sent", pdf_url: null }));
    expect(h.download).not.toHaveBeenCalled();
    expect(h.generate).toHaveBeenCalled();
  });
});

describe("markInvoiceSent", () => {
  it("freezes the PDF first, then issues only if still a draft", async () => {
    await markInvoiceSent(record(), "org-1", null);
    expect(h.order).toEqual(["render", "upload", "update:pdf_url", "update:sent_at,status"]);
    const issue = h.updates[1];
    expect(issue.values.status).toBe("sent");
    expect(typeof issue.values.sent_at).toBe("string");
    expect(issue.filters).toEqual([["id", "inv-1"], ["status", "draft"]]);
  });

  it("refuses anything that is not a draft, before touching storage", async () => {
    await expect(markInvoiceSent(record({ status: "sent" }), "org-1", null)).rejects.toThrow(/Only a draft/);
    expect(h.order).toEqual([]);
  });

  it("does not issue when the PDF cannot be stored", async () => {
    h.upload.mockResolvedValue({ error: { message: "offline" } });
    await expect(markInvoiceSent(record(), "org-1", null)).rejects.toThrow(/offline/);
    expect(h.updates).toEqual([]);
  });
});

describe("payments", () => {
  it("records a payment on a sent invoice only", async () => {
    await markInvoicePaid("inv-1", { paidAt: "2026-11-20", method: "bank_transfer", reference: "  REF 1 " });
    expect(h.updates[0]).toEqual({
      values: { status: "paid", paid_at: "2026-11-20", payment_method: "bank_transfer", payment_reference: "REF 1" },
      filters: [["id", "inv-1"], ["status", "sent"]],
    });
  });

  it("stores no reference when none is given", async () => {
    await markInvoicePaid("inv-1", { paidAt: "2026-11-20", method: "cash" });
    expect(h.updates[0].values.payment_reference).toBeNull();
  });

  it("rejects a malformed date before writing", async () => {
    await expect(markInvoicePaid("inv-1", { paidAt: "20/11/2026", method: "cash" })).rejects.toThrow(/date the payment was received/);
    expect(h.updates).toEqual([]);
  });

  it("reports when the invoice was not in a payable state (no row updated)", async () => {
    h.updateResult = { data: [], error: null };
    await expect(markInvoicePaid("inv-1", { paidAt: "2026-11-20", method: "cash" })).rejects.toThrow(/Only a sent invoice/);
  });

  it("surfaces a database error", async () => {
    h.updateResult = { data: null, error: { message: "frozen" } };
    await expect(markInvoicePaid("inv-1", { paidAt: "2026-11-20", method: "cash" })).rejects.toThrow(/frozen/);
    await expect(markInvoiceUnpaid("inv-1")).rejects.toThrow(/frozen/);
  });

  it("undoes a payment, clearing its details, only from paid", async () => {
    await markInvoiceUnpaid("inv-1");
    expect(h.updates[0]).toEqual({
      values: { status: "sent", paid_at: null, payment_method: null, payment_reference: null },
      filters: [["id", "inv-1"], ["status", "paid"]],
    });
    h.updateResult = { data: [], error: null };
    await expect(markInvoiceUnpaid("inv-1")).rejects.toThrow(/not marked as paid/);
  });
});

describe("cancelInvoice", () => {
  it("requires a reason before calling the database", async () => {
    await expect(cancelInvoice("inv-1", "   ")).rejects.toThrow(/Enter a reason/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("returns the credit note id for an issued invoice, null for a draft", async () => {
    h.rpc.mockResolvedValueOnce({ data: "cn-1", error: null });
    await expect(cancelInvoice("inv-1", " Wrong PO ", true, "sent", 100)).resolves.toBe("cn-1");
    expect(h.rpc).toHaveBeenCalledWith("cancel_invoice_authorised", { p_invoice_id: "inv-1", p_reason: "Wrong PO", p_authorise_credit: true, p_expected_status: "sent", p_expected_total: 100 });
    await expect(cancelInvoice("inv-1", "Mistake")).resolves.toBeNull();
    expect(h.rpc).toHaveBeenLastCalledWith("cancel_invoice_authorised", { p_invoice_id: "inv-1", p_reason: "Mistake", p_authorise_credit: false, p_expected_status: undefined, p_expected_total: undefined });
  });

  it("passes the database's refusal through", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "invoice AX26-1007 is already cancelled" } });
    await expect(cancelInvoice("inv-1", "x")).rejects.toThrow(/already cancelled/);
  });
});
