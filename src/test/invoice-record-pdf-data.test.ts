import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { invoiceRecordToPdfData, type InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";

const base: InvoiceRecord = {
  id: "inv-1",
  invoice_number: "AX-INV-0042",
  client_name: "BCA",
  client_company: "BCA Blackbushe",
  client_email: "ap@bca.com",
  client_address: "Blackbushe, Hart",
  issue_date: "2026-07-01",
  due_date: null,
  payment_terms: "Net 30",
  line_items: [],
  subtotal: 100,
  vat_rate: 20,
  vat_amount: 20,
  total: 120,
  notes: null,
  status: "draft",
  created_at: "2026-07-01T10:00:00Z",
};

describe("invoiceRecordToPdfData", () => {
  it("normalises multi-job flow line_items ({amount, sort_order}) in stored order", () => {
    const record = {
      ...base,
      line_items: [
        { description: "Job B", amount: 200, quantity: 1, sort_order: 1 },
        { description: "Job A", amount: 100, quantity: 1, sort_order: 0 },
      ],
    };
    const data = invoiceRecordToPdfData(record);
    expect(data.lineItems).toEqual([
      { description: "Job A", quantity: 1, unitPrice: 100 },
      { description: "Job B", quantity: 1, unitPrice: 200 },
    ]);
  });

  it("normalises legacy single-job flow line_items ({unitPrice})", () => {
    const record = {
      ...base,
      line_items: [{ description: "Transport", quantity: 2, unitPrice: 75.5 }],
    };
    const data = invoiceRecordToPdfData(record);
    expect(data.lineItems).toEqual([{ description: "Transport", quantity: 2, unitPrice: 75.5 }]);
  });

  it("tolerates malformed line_items without throwing", () => {
    const record = { ...base, line_items: [null, "junk", { quantity: "x" }] as unknown };
    const data = invoiceRecordToPdfData(record);
    expect(data.lineItems).toEqual([
      { description: "Line item", quantity: 1, unitPrice: 0 },
    ]);
    expect(invoiceRecordToPdfData({ ...base, line_items: null }).lineItems).toEqual([]);
  });

  it("falls back to created_at when issue_date is null and maps client fields", () => {
    const data = invoiceRecordToPdfData({ ...base, issue_date: null });
    expect(data.issueDate).toBe("2026-07-01T10:00:00Z");
    expect(data.invoiceNumber).toBe("AX-INV-0042");
    expect(data.clientName).toBe("BCA");
    expect(data.vatRate).toBe(20);
  });
});

describe("invoiceRecordToPdfData — multi-job invoices with expenses", () => {
  const multi: InvoiceRecord = {
    ...base,
    invoice_number: "AX26-1007",
    client_ref: "PO-4500123",
    vat_registered: false,
    vat_rate: 0,
    document_type: "invoice",
    line_items: [
      { description: "AX1043 | 03/11/2026 | XY69 ZZZ | Bristol BS34 - Cardiff CF11", amount: 95, quantity: 1, sort_order: 1, job_id: "j2", job_ref: "AX1043", job_date: "2026-11-03" },
      { description: "AX1042 | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34", amount: 185, quantity: 1, sort_order: 0, job_id: "j1", job_ref: "AX1042", job_date: "2026-11-02", detail: "Expenses: Fuel £54.60 (R01)", expense_amount: 54.6 },
    ],
  };

  it("carries each job's expense line and amount through to the PDF rows", () => {
    const data = invoiceRecordToPdfData(multi);
    expect(data.lineItems).toEqual([
      { description: "AX1042 | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34", quantity: 1, unitPrice: 185, detail: "Expenses: Fuel £54.60 (R01)", expenseAmount: 54.6 },
      { description: "AX1043 | 03/11/2026 | XY69 ZZZ | Bristol BS34 - Cardiff CF11", quantity: 1, unitPrice: 95 },
    ]);
  });

  it("uses the compact layout with a job count + date range, PO and VAT status", () => {
    const data = invoiceRecordToPdfData(multi);
    expect(data.compactFooter).toBe(true);
    expect(data.headerSubtitle).toBe("2 jobs | 2 - 3 November 2026");
    expect(data.clientRef).toBe("PO-4500123");
    expect(data.vatRegistered).toBe(false);
    expect(data.documentType).toBeUndefined();
  });

  it("leaves a pre-switch invoice (vat_registered null) in its original presentation", () => {
    const data = invoiceRecordToPdfData({ ...base, vat_registered: null, line_items: [{ description: "Job", amount: 100, quantity: 1, sort_order: 0 }] });
    expect(data).not.toHaveProperty("vatRegistered");
    expect(data).not.toHaveProperty("compactFooter");
    expect(data).not.toHaveProperty("headerSubtitle");
    expect(data.vatRate).toBe(20);
  });

  it("marks a credit note", () => {
    expect(invoiceRecordToPdfData({ ...multi, document_type: "credit_note" }).documentType).toBe("credit_note");
  });
});
