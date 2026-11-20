/**
 * Client portal: an invoice's status as the client sees it, and that
 * "Download PDF" serves the file stored when the invoice was issued.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PortalInvoiceDetail, PortalInvoiceSummary } from "@/features/portal/api";

const h = vi.hoisted(() => ({
  invoice: null as unknown,
  list: [] as unknown[],
  loading: false,
  error: null as Error | null,
  download: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  rendered: [] as unknown[],
  saved: [] as string[],
  toasts: [] as { title?: string }[],
  ctx: undefined as unknown,
  jobs: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ download: (...a: unknown[]) => h.download(...a) }) } },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => h.toasts.push(t) }));
vi.mock("@/features/portal/api", () => ({
  usePortalInvoice: () => ({ data: h.invoice, isLoading: h.loading, error: h.error }),
  usePortalInvoices: () => ({ data: h.list, isLoading: h.loading, error: h.error }),
  usePortalContext: () => ({ data: h.ctx }),
  usePortalJobs: () => ({ data: h.jobs }),
}));
vi.mock("@/lib/invoicePdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoicePdf")>()),
  downloadInvoicePdf: async (data: unknown) => {
    h.rendered.push(data);
  },
}));

import PortalInvoiceDetailPage from "@/features/portal/pages/PortalInvoiceDetail";
import PortalInvoices from "@/features/portal/pages/PortalInvoices";

function detail(over: Partial<PortalInvoiceDetail> = {}): PortalInvoiceDetail {
  return {
    id: "inv-1", invoice_number: "AX26-1007", issue_date: "2026-11-14", due_date: "2026-12-14", subtotal: 248.5,
    vat_amount: 0, total: 248.5, sent_at: "2026-11-14T10:00:00Z", status: "sent", document_type: "invoice",
    payment_terms: "Payable within 30 days", client_name: "Chris", client_company: "CJE Transport", client_email: null,
    client_address: "1 Yard Lane", notes: null, vat_rate: 0, job_ref: null, vehicle_reg: null,
    items: [{ description: "AX1042 | Leeds - Bristol - Expenses: Fuel £54.60 (R01)", quantity: 1, unit_price: 248.5, amount: 248.5 }],
    line_items: [{ description: "AX1042 | Leeds - Bristol", amount: 185, quantity: 1, sort_order: 0, job_ref: "AX1042", job_date: "2026-11-02", detail: "Expenses: Fuel £54.60 (R01)", expense_amount: 63.5 }],
    operator: {
      name: "Axentra", legal_name: "T Example t/a Axentra", logo_url: null, registered_address: "1 Test Street", vat_number: "GB1", company_number: "123",
      bank_name: "Test Bank", bank_account_name: "Test Ltd", bank_sort_code: "12-34-56", bank_account_number: "12345678", late_payment_notice: true,
    },
    client_ref: "PO-1", vat_registered: false, pdf_path: "org-1/AXENTRA_INV_AX26-1007.pdf", credits_invoice_number: null,
    ...over,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/portal/invoices/inv-1"]}>
      <Routes>
        <Route path="/portal/invoices/:invoiceId" element={<PortalInvoiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.invoice = detail();
  h.list = [];
  h.loading = false;
  h.error = null;
  h.download = vi.fn().mockResolvedValue({ data: new Blob(["stored"]), error: null });
  h.rendered = [];
  h.saved = [];
  h.toasts = [];
  h.ctx = undefined;
  h.jobs = [];
  // capture the browser download triggered through an <a download>
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    h.saved.push(this.download);
  });
});

describe("PortalInvoiceDetail", () => {
  it("shows the invoice with the client's reference and no VAT line while the supplier is not VAT registered", () => {
    renderDetail();
    expect(screen.getByText("AX26-1007")).toBeTruthy();
    expect(screen.getByText("Your ref: PO-1")).toBeTruthy();
    expect(screen.getByText("Terms: Payable within 30 days")).toBeTruthy();
    expect(screen.queryByText(/^VAT/)).toBeNull();
    expect(screen.queryByText(/has been cancelled/)).toBeNull();
  });

  it("shows the VAT line for a VAT invoice and for invoices from before the switch", () => {
    h.invoice = detail({ vat_registered: true, vat_rate: 20, vat_amount: 49.7 });
    const first = renderDetail();
    expect(screen.getByText("VAT (20%)")).toBeTruthy();
    first.unmount();
    h.invoice = detail({ vat_registered: null, vat_rate: 0 });
    renderDetail();
    expect(screen.getByText("VAT (0%)")).toBeTruthy();
  });

  it("marks a cancelled invoice as not payable, and a paid one as paid", () => {
    h.invoice = detail({ status: "cancelled" });
    const first = renderDetail();
    expect(screen.getByText(/has been cancelled and is not payable/)).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    first.unmount();
    h.invoice = detail({ status: "paid" });
    renderDetail();
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  it("presents a credit note as one, naming the invoice it cancels, with no payment terms", () => {
    h.invoice = detail({ invoice_number: "CN26-0001", document_type: "credit_note", credits_invoice_number: "AX26-1007", total: -248.5 });
    renderDetail();
    expect(screen.getAllByText("Credit note").length).toBeGreaterThan(0);
    expect(screen.getByText("AX26-1007")).toBeTruthy();
    expect(screen.queryByText(/^Terms:/)).toBeNull();
  });

  it("downloads the PDF stored at issue rather than rebuilding it", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(h.saved).toEqual(["AXENTRA_INV_AX26-1007.pdf"]));
    expect(h.download).toHaveBeenCalledWith("org-1/AXENTRA_INV_AX26-1007.pdf");
    expect(h.rendered).toEqual([]);
  });

  it("rebuilds the PDF when there is no stored file, carrying the PO, VAT status and supplier details", async () => {
    h.invoice = detail({ pdf_path: null });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(h.rendered).toHaveLength(1));
    expect(h.download).not.toHaveBeenCalled();
    expect(h.rendered[0]).toMatchObject({
      invoiceNumber: "AX26-1007",
      clientRef: "PO-1",
      vatRegistered: false,
      compactFooter: true,
      // no VAT number is printed for a supplier that is not VAT registered
      business: { name: "T Example t/a Axentra", address: "1 Test Street", companyNumber: "123", vatNumber: null },
      bank: { bankName: "Test Bank", accountName: "Test Ltd", sortCode: "12-34-56", accountNumber: "12345678" },
      latePaymentNotice: true,
      lineItems: [{ description: "AX1042 | Leeds - Bristol", quantity: 1, unitPrice: 185, detail: "Expenses: Fuel £54.60 (R01)", expenseAmount: 63.5 }],
    });
  });

  it("leaves the late-payment sentence off when the supplier has switched it off", async () => {
    h.invoice = detail({ pdf_path: null, operator: { ...detail().operator, late_payment_notice: false } });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(h.rendered).toHaveLength(1));
    expect(h.rendered[0]).not.toHaveProperty("latePaymentNotice");
  });

  it("falls back to rebuilding when the stored file cannot be read", async () => {
    h.download.mockResolvedValue({ data: null, error: { message: "denied" } });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(h.rendered).toHaveLength(1));
    expect(h.saved).toEqual([]);
  });

  it("tells the client when the download fails", async () => {
    h.download.mockRejectedValue(new Error("offline"));
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Download failed" }));
  });

  it("handles loading and a missing invoice", () => {
    h.invoice = null;
    h.error = new Error("NOT_FOUND");
    renderDetail();
    expect(screen.getByText("This invoice couldn't be found.")).toBeTruthy();
  });
});

describe("PortalInvoices", () => {
  const row = (over: Partial<PortalInvoiceSummary>): PortalInvoiceSummary => ({
    id: "x", invoice_number: "AX26-1", issue_date: "2026-11-14", due_date: null, subtotal: 100, vat_amount: 0, total: 100,
    sent_at: "2026-11-14T10:00:00Z", status: "sent", document_type: "invoice", ...over,
  });

  it("labels every row: paid, cancelled, credit note, and a sent invoice with no due date as awaiting payment", () => {
    h.list = [
      row({ id: "1", invoice_number: "AX26-1" }),
      row({ id: "2", invoice_number: "AX26-2", status: "paid" }),
      row({ id: "3", invoice_number: "AX26-3", status: "cancelled" }),
      row({ id: "4", invoice_number: "CN26-0001", document_type: "credit_note" }),
    ];
    render(<MemoryRouter><PortalInvoices /></MemoryRouter>);
    const label = (n: string) => screen.getByText(n).closest("p")!.textContent!.replace(n, "");
    expect([label("AX26-1"), label("AX26-2"), label("AX26-3"), label("CN26-0001")]).toEqual(["Awaiting payment", "Paid", "Cancelled", "Credit note"]);
  });

  it("shows an empty state and a load error", () => {
    const first = render(<MemoryRouter><PortalInvoices /></MemoryRouter>);
    expect(screen.getByText("No invoices yet.")).toBeTruthy();
    first.unmount();
    h.error = new Error("x");
    render(<MemoryRouter><PortalInvoices /></MemoryRouter>);
    expect(screen.getByText(/Couldn't load your invoices/)).toBeTruthy();
  });
});
