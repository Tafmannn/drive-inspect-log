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
