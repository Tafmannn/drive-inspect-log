/**
 * The Accounts section on the Exports page: figures for the chosen period,
 * the VAT threshold watch, and the pack / Xero downloads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountExpense, AccountInvoice } from "@/features/accounts/lib/accountsReports";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const h = vi.hoisted(() => ({
  vatRegistered: false,
  invoices: [] as unknown[],
  expenses: [] as unknown[],
  error: null as Error | null,
  periods: [] as { from: string; to: string }[],
  buildPack: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  downloads: [] as { name: string; blob: Blob }[],
  toasts: [] as { title?: string; description?: string; variant?: string }[],
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => h.toasts.push(t) }));
vi.mock("@/features/invoicing/hooks/useInvoiceSettings", () => ({
  useOrgInvoiceSettings: () => ({ data: { orgId: "org-1", vatRegistered: h.vatRegistered, business: { name: "Axentra" } } }),
}));
vi.mock("@/features/accounts/api/accountsData", () => ({
  fetchAccountsData: async (period: { from: string; to: string }) => {
    h.periods.push(period);
    if (h.error) throw h.error;
    return { invoices: h.invoices, invoiceRecords: [], expenses: h.expenses, receipts: new Map() };
  },
}));
vi.mock("@/features/accounts/api/accountsPack", () => ({
  buildAccountsPack: (...a: unknown[]) => h.buildPack(...a),
}));
vi.mock("@/features/invoicing/api/receiptExport", () => ({
  downloadBlob: (blob: Blob, name: string) => h.downloads.push({ name, blob }),
}));

import { AccountsSection } from "@/features/accounts/components/AccountsSection";

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function inv(n: string, over: Partial<AccountInvoice> = {}): AccountInvoice {
  return {
    id: n, invoice_number: n, document_type: "invoice", status: "sent", issue_date: today(), due_date: null,
    sent_at: "x", paid_at: null, payment_method: null, payment_reference: null, client_id: "c", client_name: "Chris",
    client_company: "CJE Transport", client_email: null, client_address: null, client_ref: null, subtotal: 1000,
    expenses_total: 0, vat_rate: 0, vat_amount: 0, total: 1000, vat_registered: false, cancel_reason: null,
    line_items: [{ description: "Job", amount: 1000, quantity: 1, sort_order: 0 }],
    ...over,
  };
}
function exp(id: string, over: Partial<AccountExpense> = {}): AccountExpense {
  return {
    id, date: today(), category: "Fuel", supplier: "Shell", label: null, notes: null, amount: 50, vat_amount: null,
    job_ref: "AX1", vehicle_reg: null, driver_name: null, invoiced_on: null, amount_recharged: null, receipt_count: 1,
    ...over,
  };
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountsSection />
    </QueryClientProvider>,
  );
}

/** Figures have loaded. */
async function ready() {
  await screen.findByText("Income (ex VAT)");
}

async function csvText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

beforeEach(() => {
  h.vatRegistered = false;
  h.invoices = [inv("AX26-1007"), inv("AX26-1008", { status: "draft", sent_at: null })];
  h.expenses = [exp("11111111-1"), exp("22222222-2", { receipt_count: 0, amount: 12 })];
  h.error = null;
  h.periods = [];
  h.downloads = [];
  h.toasts = [];
  h.buildPack = vi.fn(async () => ({
    blob: new Blob(["zip"]), fileName: "accounts_pack.zip", summary: {}, invoicePdfs: 1, receiptFiles: 1, problems: [],
  }));
  window.localStorage.clear();
});

describe("AccountsSection", () => {
  it("shows the period's figures and flags drafts and missing receipts", async () => {
    renderSection();
    await ready();
    // income (the issued invoice only) and the same invoice as unpaid
    expect(screen.getAllByText("£1,000.00")).toHaveLength(2);
    expect(screen.getByText("£62.00")).toBeTruthy(); // expenses
    expect(screen.getByText("£938.00")).toBeTruthy(); // income less expenses
    expect(screen.getByText(/1 draft invoice is dated in this period and not counted/)).toBeTruthy();
    expect(screen.getByText(/1 expense has no receipt on file/)).toBeTruthy();
  });

  it("tracks the VAT threshold while not registered, and hides it once registered", async () => {
    h.invoices = [inv("A", { subtotal: 75_000 })];
    const first = renderSection();
    expect(await screen.findByText("VAT registration threshold")).toBeTruthy();
    expect(screen.getByText(/£75,000.00 of £90,000.00/)).toBeTruthy();
    expect(screen.getByText(/Over 80% of the threshold/)).toBeTruthy();
    first.unmount();

    h.vatRegistered = true;
    renderSection();
    await ready();
    expect(screen.queryByText("VAT registration threshold")).toBeNull();
  });

  it("warns clearly when the threshold has been passed", async () => {
    h.invoices = [inv("A", { subtotal: 95_000 })];
    renderSection();
    expect(await screen.findByText(/Over the threshold: you must register for VAT/)).toBeTruthy();
  });

  it("reloads for a different period, and validates custom dates", async () => {
    renderSection();
    await ready();
    const select = screen.getByLabelText("Period") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });
    await waitFor(() => expect(h.periods.length).toBe(2));
    expect(h.periods[1].to < h.periods[0].from).toBe(true); // last month ends before this month starts

    fireEvent.change(select, { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-01" } });
    expect(screen.getByText(/start date that is on or before the end date/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Download accounts pack/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a load failure instead of figures", async () => {
    h.error = new Error("Could not load expenses: relation missing");
    renderSection();
    expect(await screen.findByText(/Could not load the figures: Could not load expenses/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Sales invoices/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads the accounts pack with the chosen options", async () => {
    renderSection();
    await ready();
    fireEvent.click(screen.getByLabelText("Include receipt files"));
    fireEvent.click(screen.getByRole("button", { name: /Download accounts pack/ }));

    await waitFor(() => expect(h.downloads).toHaveLength(1));
    expect(h.downloads[0].name).toBe("accounts_pack.zip");
    expect(h.buildPack.mock.calls[0][0]).toMatchObject({ includeInvoicePdfs: true, includeReceipts: false });
    expect(h.toasts[0].title).toBe("Accounts pack downloaded");
  });

  it("says when the pack is missing items, and when it fails outright", async () => {
    h.buildPack = vi.fn(async () => ({
      blob: new Blob(["zip"]), fileName: "p.zip", summary: {}, invoicePdfs: 0, receiptFiles: 0, problems: ["Receipt x: file could not be downloaded"],
    }));
    renderSection();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Download accounts pack/ }));
    await waitFor(() => expect(h.toasts).toHaveLength(1));
    expect(h.toasts[0]).toMatchObject({ title: "Accounts pack downloaded — 1 item missing", variant: "destructive" });

    h.buildPack = vi.fn(async () => { throw new Error("zip failed"); });
    fireEvent.click(screen.getByRole("button", { name: /Download accounts pack/ }));
    await waitFor(() => expect(h.toasts).toHaveLength(2));
    expect(h.toasts[1]).toMatchObject({ title: "Accounts pack failed", description: "zip failed" });
  });

  it("downloads the Xero sales file for issued invoices only", async () => {
    renderSection();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Sales invoices/ }));

    expect(h.downloads).toHaveLength(1);
    expect(h.downloads[0].name).toMatch(/^xero_sales_invoices_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await csvText(h.downloads[0].blob);
    expect(csv.startsWith("*ContactName,")).toBe(true);
    expect(csv).toContain("AX26-1007");
    expect(csv).not.toContain("AX26-1008");
    expect(h.toasts[0].description).toMatch(/1 invoice\. Import as Tax Exclusive/);
  });

  it("downloads the Xero bills file, and says so when there is nothing to export", async () => {
    renderSection();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Bills from expenses/ }));
    expect(h.downloads[0].name).toMatch(/^xero_bills_/);
    expect(await csvText(h.downloads[0].blob)).toContain("EXP-11111111");
    expect(h.toasts[0].description).toMatch(/2 expenses\. Import as Tax Inclusive/);
  });

  it("exports nothing when the period is empty", async () => {
    h.invoices = [];
    h.expenses = [];
    renderSection();
    await screen.findAllByText("£0.00");
    fireEvent.click(screen.getByRole("button", { name: /Sales invoices/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bills from expenses/ }));
    expect(h.downloads).toEqual([]);
    expect(h.toasts.map((t) => t.title)).toEqual(["Nothing to export", "Nothing to export"]);
  });

  it("applies and remembers Xero account codes, and can reset them", async () => {
    renderSection();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Xero settings/ }));
    fireEvent.change(screen.getByLabelText("Sales account"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Fuel"), { target: { value: "7300" } });
    expect(JSON.parse(window.localStorage.getItem("axentra.xeroConfig.v1")!)).toMatchObject({ salesAccount: "4000" });

    fireEvent.click(screen.getByRole("button", { name: /Sales invoices/ }));
    expect(await csvText(h.downloads[0].blob)).toContain(",4000,No VAT,");
    fireEvent.click(screen.getByRole("button", { name: /Bills from expenses/ }));
    expect(await csvText(h.downloads[1].blob)).toContain(",7300,No VAT,");

    fireEvent.click(screen.getByRole("button", { name: /Reset to Xero defaults/ }));
    expect((screen.getByLabelText("Sales account") as HTMLInputElement).value).toBe("200");
    expect(window.localStorage.getItem("axentra.xeroConfig.v1")).toBeNull();
  });

  it("starts from saved Xero settings, tolerating corrupt storage", async () => {
    window.localStorage.setItem("axentra.xeroConfig.v1", JSON.stringify({ salesAccount: "4100", expenseAccounts: { Fuel: "7301" } }));
    const first = renderSection();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Xero settings/ }));
    expect((screen.getByLabelText("Sales account") as HTMLInputElement).value).toBe("4100");
    expect((screen.getByLabelText("Fuel") as HTMLInputElement).value).toBe("7301");
    expect((screen.getByLabelText("Tolls") as HTMLInputElement).value).toBe("449"); // unsaved categories keep defaults
    first.unmount();

    window.localStorage.setItem("axentra.xeroConfig.v1", "{not json");
    renderSection();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Xero settings/ }));
    expect((screen.getByLabelText("Sales account") as HTMLInputElement).value).toBe("200");
  });
});
