import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { filterInvoices } from "@/features/invoicing/components/InvoiceList";
import type { InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";

const inv = (o: Partial<InvoiceRecord> & { invoice_number: string }): InvoiceRecord =>
  ({
    id: o.invoice_number, client_name: "X", client_company: null, client_email: null, client_address: null,
    issue_date: "2026-11-01", due_date: "2026-12-01", payment_terms: null, line_items: [], subtotal: 1, vat_rate: 0,
    vat_amount: 0, total: 1, notes: null, status: "draft", created_at: "2026-11-01", document_type: "invoice", ...o,
  }) as InvoiceRecord;

const TODAY = "2026-11-27";
const list = [
  inv({ invoice_number: "AX26-1011", client_company: "Revillo Automotive ", client_ref: "PO-77" }),
  inv({ invoice_number: "AX26-1009", client_company: "Movex", status: "sent", due_date: "2026-11-01" }),
  inv({ invoice_number: "AX26-1008", client_company: "Movex", status: "paid" }),
  inv({ invoice_number: "AX26-1010", client_company: "Revillo Automotive", status: "cancelled" }),
  inv({ invoice_number: "CN26-0001", client_company: "Revillo Automotive", status: "sent", document_type: "credit_note" }),
];
const nums = (r: InvoiceRecord[]) => r.map((i) => i.invoice_number);

describe("filterInvoices", () => {
  it("searches invoice number, client and PO, ignoring case", () => {
    expect(nums(filterInvoices(list, { search: "po-77" }, TODAY))).toEqual(["AX26-1011"]);
    expect(nums(filterInvoices(list, { search: "movex" }, TODAY))).toEqual(["AX26-1009", "AX26-1008"]);
    expect(nums(filterInvoices(list, { search: "1010" }, TODAY))).toEqual(["AX26-1010"]);
  });

  it("'unpaid' means draft, sent or overdue invoices — never credit notes", () => {
    expect(nums(filterInvoices(list, { status: "unpaid" }, TODAY))).toEqual(["AX26-1011", "AX26-1009"]);
    expect(nums(filterInvoices(list, { status: "overdue" }, TODAY))).toEqual(["AX26-1009"]);
    expect(nums(filterInvoices(list, { status: "credit" }, TODAY))).toEqual(["CN26-0001"]);
  });

  it("filters by client (trimmed name) and combines with status", () => {
    expect(nums(filterInvoices(list, { client: "Revillo Automotive", status: "cancelled" }, TODAY))).toEqual(["AX26-1010"]);
    expect(nums(filterInvoices(list, { client: "Revillo Automotive" }, TODAY))).toEqual(["AX26-1011", "AX26-1010", "CN26-0001"]);
  });
});
