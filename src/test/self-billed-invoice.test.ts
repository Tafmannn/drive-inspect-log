import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: (...a: unknown[]) => h.upload(...a), remove: (...a: unknown[]) => h.remove(...a) }) },
    rpc: (...a: unknown[]) => h.rpc(...a),
  },
}));

import {
  recordSelfBilledInvoice,
  selfBillErrorMessage,
  validateSelfBill,
} from "@/features/invoicing/api/selfBilledInvoice";

const pdf = new File(["%PDF"], "Movex Invoice 7781.pdf", { type: "application/pdf" });
const base = {
  clientId: "mov", invoiceNumber: "MVX-7781", issueDate: "2026-11-20", paidAt: "2026-11-25",
  lines: [{ jobId: "j1", amount: 110 }, { jobId: "j2", amount: 95.555 }], pdf,
};

beforeEach(() => {
  h.upload.mockReset().mockResolvedValue({ error: null });
  h.remove.mockReset().mockResolvedValue({ error: null });
  h.rpc.mockReset().mockResolvedValue({ data: "inv-9", error: null });
});

describe("validateSelfBill", () => {
  it("accepts a complete form", () => {
    expect(validateSelfBill(base, "2026-11-27")).toEqual([]);
  });

  it("lists everything missing in plain words", () => {
    expect(
      validateSelfBill({ ...base, invoiceNumber: " ", issueDate: "2026-12-01", paidAt: "", lines: [{ jobId: "j1", amount: 0 }], pdf: null }, "2026-11-27"),
    ).toEqual([
      "Enter their invoice number.",
      "Their invoice date can't be in the future.",
      "Enter the date you were paid.",
      "Every job needs the amount they paid, above £0.",
      "Attach their invoice PDF.",
    ]);
  });

  it("only takes a PDF", () => {
    const img = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    expect(validateSelfBill({ ...base, pdf: img }, "2026-11-27")).toEqual(["Their invoice must be a PDF."]);
  });
});

describe("recordSelfBilledInvoice", () => {
  it("stores their PDF in the org's self-billed folder, then records it with rounded amounts", async () => {
    await expect(recordSelfBilledInvoice({ ...base, orgId: "org-1" })).resolves.toBe("inv-9");
    const path = h.upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^org-1\/self-billed\/[0-9a-f-]{36}\/Movex_Invoice_7781\.pdf$/);
    expect(h.rpc).toHaveBeenCalledWith("record_self_billed_invoice", expect.objectContaining({
      p_client_id: "mov", p_invoice_number: "MVX-7781", p_pdf_path: path,
      p_lines: [{ job_id: "j1", amount: 110 }, { job_id: "j2", amount: 95.56 }],
    }));
  });

  it("removes the uploaded PDF and explains the refusal when the record is rejected", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "JOB_ALREADY_INVOICED: AX0079 is already on an invoice" } });
    await expect(recordSelfBilledInvoice({ ...base, orgId: "org-1" })).rejects.toThrow(
      "AX0079 is already on an invoice. Untick it and try again.",
    );
    expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0][0]]);
  });

  it("never calls the database when the upload fails", async () => {
    h.upload.mockResolvedValue({ error: { message: "quota" } });
    await expect(recordSelfBilledInvoice({ ...base, orgId: "org-1" })).rejects.toThrow("Could not store their PDF: quota");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("selfBillErrorMessage", () => {
  it("translates database refusals", () => {
    expect(selfBillErrorMessage("SELF_BILL_NUMBER_IN_USE: invoice number X")).toMatch(/already recorded/);
    expect(selfBillErrorMessage("CLIENT_NOT_SELF_BILLING: Revillo")).toMatch(/Change their Invoicing setting/);
    expect(selfBillErrorMessage("Could not find the function public.record_self_billed_invoice")).toMatch(/database update/);
  });
});
