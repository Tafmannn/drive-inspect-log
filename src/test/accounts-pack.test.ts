// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

/**
 * The accounts data reader and the accountant's pack ZIP, against a mocked
 * Supabase and mocked file fetches.
 */
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  invoices: [] as Row[],
  expenses: [] as Row[],
  invoiceError: null as { message: string } | null,
  expenseError: null as { message: string } | null,
  filters: [] as [string, string, unknown][],
  getInvoicePdf: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  fetchReceiptBlob: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) chain[m] = () => chain;
      for (const m of ["eq", "gte", "lte"]) {
        chain[m] = (col: string, val: unknown) => {
          h.filters.push([table, `${m}:${col}`, val]);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(
          table === "invoices"
            ? { data: h.invoiceError ? null : h.invoices, error: h.invoiceError }
            : { data: h.expenseError ? null : h.expenses, error: h.expenseError },
        ).then(res);
      return chain;
    },
  },
}));

vi.mock("@/features/invoicing/api/invoiceLifecycle", () => ({
  getInvoicePdf: (...a: unknown[]) => h.getInvoicePdf(...a),
}));
vi.mock("@/features/invoicing/api/receiptImages", () => ({
  fetchReceiptBlob: (...a: unknown[]) => h.fetchReceiptBlob(...a),
}));

import { fetchAccountsData } from "@/features/accounts/api/accountsData";
import { buildAccountsPack, xeroReadme } from "@/features/accounts/api/accountsPack";
import { DEFAULT_XERO_CONFIG } from "@/features/accounts/lib/accountsReports";

const PERIOD = { from: "2026-11-01", to: "2026-11-30", label: "November 2026" };
const SETTINGS = { vatRegistered: false, business: { name: "Axentra" } };

function invoiceRow(over: Row): Row {
  return {
    id: over.invoice_number, org_id: "org-1", client_id: "c1", client_name: "Chris", client_company: "CJE Transport",
    client_email: "a@cje.example", client_address: null, issue_date: "2026-11-14", due_date: "2026-12-14",
    payment_terms: null, line_items: [{ description: "AX1042 job", amount: 185, quantity: 1, sort_order: 0, detail: "Expenses: Fuel £54.60 (R01)", expense_amount: 54.6 }],
    subtotal: "239.60", vat_rate: "0", vat_amount: "0", total: "239.60", notes: null, status: "sent",
    created_at: "2026-11-14T09:00:00Z", client_ref: "PO-1", vat_registered: false, expenses_total: "54.60",
    document_type: "invoice", credits_invoice_id: null, sent_at: "2026-11-14T10:00:00Z", paid_at: null,
    payment_method: null, payment_reference: null, cancelled_at: null, cancel_reason: null, pdf_url: "org-1/x.pdf",
    ...over,
  };
}

const EXPENSE_ROWS: Row[] = [
  {
    id: "1a2b3c4d-0000-0000-0000-000000000001", date: "2026-11-02", category: "Fuel", supplier: "Shell", label: null, notes: null,
    amount: "54.60", vat_amount: "9.10",
    jobs: { external_job_number: "AX1042", vehicle_reg: "AB12 CDE", driver_name: "Sam" },
    expense_receipts: [
      { url: "u2", backend: "supabase", backend_ref: "e/b.jpg", created_at: "2026-11-02T10:05:00Z" },
      { url: "u1", backend: "supabase", backend_ref: "e/a.jpg", created_at: "2026-11-02T10:00:00Z" },
    ],
    invoice_expenses: [
      { voided: true, amount_charged: "50.00", invoices: { invoice_number: "AX26-1005" } }, // cancelled invoice
      { voided: false, amount_charged: "54.60", invoices: { invoice_number: "AX26-1007" } },
    ],
  },
  {
    id: "2b2b3c4d-0000-0000-0000-000000000002", date: "2026-11-03", category: "Car Wash / Valet", supplier: null, label: "Valet", notes: null,
    amount: "12.00", vat_amount: null, jobs: null, expense_receipts: null, invoice_expenses: null,
  },
];

beforeEach(() => {
  h.invoices = [
    invoiceRow({ invoice_number: "AX26-1007" }),
    invoiceRow({ invoice_number: "AX26-1008", status: "cancelled" }),
    invoiceRow({ invoice_number: "CN26-0001", document_type: "credit_note", credits_invoice_id: "AX26-1008", subtotal: "-239.60", total: "-239.60", expenses_total: "-54.60", due_date: null }),
    invoiceRow({ invoice_number: "AX26-1009", status: "draft", sent_at: null, pdf_url: null }),
  ];
  h.expenses = EXPENSE_ROWS;
  h.invoiceError = null;
  h.expenseError = null;
  h.filters = [];
  h.getInvoicePdf = vi.fn(async (r: Row) => new Blob([`pdf:${r.invoice_number}`]));
  h.fetchReceiptBlob = vi.fn(async () => new Blob(["img"], { type: "image/jpeg" }));
});

describe("fetchAccountsData", () => {
  it("limits expenses to the period, hides hidden ones and leaves out test data; invoices are read for all dates", async () => {
    await fetchAccountsData(PERIOD);
    expect(h.filters).toEqual([
      ["invoices", "eq:is_test", false],
      ["expenses", "eq:is_hidden", false],
      ["expenses", "eq:is_test", false],
      ["expenses", "gte:date", "2026-11-01"],
      ["expenses", "lte:date", "2026-11-30"],
    ]);
  });

  it("maps invoices to numbers and names the invoice a credit note credits", async () => {
    const data = await fetchAccountsData(PERIOD);
    const cn = data.invoices.find((i) => i.invoice_number === "CN26-0001")!;
    expect(cn).toMatchObject({ document_type: "credit_note", subtotal: -239.6, total: -239.6, credits_invoice_number: "AX26-1008" });
    expect(data.invoices[0]).toMatchObject({ subtotal: 239.6, expenses_total: 54.6, vat_rate: 0, client_ref: "PO-1" });
    expect(data.invoiceRecords).toHaveLength(4);
  });

  it("ties an expense to the live invoice it was recharged on, ignoring a cancelled one", async () => {
    const { expenses, receipts } = await fetchAccountsData(PERIOD);
    expect(expenses[0]).toMatchObject({
      amount: 54.6, vat_amount: 9.1, job_ref: "AX1042", vehicle_reg: "AB12 CDE", driver_name: "Sam",
      invoiced_on: "AX26-1007", amount_recharged: 54.6, receipt_count: 2,
    });
    // receipt files in upload order
    expect(receipts.get(expenses[0].id)?.map((r) => r.url)).toEqual(["u1", "u2"]);
    expect(expenses[1]).toMatchObject({ job_ref: null, invoiced_on: null, amount_recharged: null, receipt_count: 0, vat_amount: null });
  });

  it("surfaces read errors", async () => {
    h.invoiceError = { message: "denied" };
    await expect(fetchAccountsData(PERIOD)).rejects.toThrow(/Could not load invoices: denied/);
    h.invoiceError = null;
    h.expenseError = { message: "relation invoice_expenses does not exist" };
    await expect(fetchAccountsData(PERIOD)).rejects.toThrow(/Could not load expenses/);
  });
});

describe("buildAccountsPack", () => {
  async function build(over: Partial<Parameters<typeof buildAccountsPack>[0]> = {}) {
    const data = await fetchAccountsData(PERIOD);
    const pack = await buildAccountsPack({
      period: PERIOD, data, settings: SETTINGS, xero: DEFAULT_XERO_CONFIG,
      includeInvoicePdfs: true, includeReceipts: true, today: "2026-11-30", ...over,
    });
    const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
    const files = Object.keys(zip.files).filter((n) => !n.endsWith("/")).sort((a, b) => a.localeCompare(b));
    return { pack, zip, files };
  }

  it("contains the workbook, CSVs, Xero files, issued invoice PDFs and receipts", async () => {
    const { pack, files } = await build();
    expect(pack.fileName).toBe("accounts_pack_2026-11-01_to_2026-11-30.zip");
    expect(files).toEqual([
      "Accounts_Summary.xlsx",
      "Expenses.csv",
      "Invoices/AXENTRA_CN_CN26-0001.pdf",
      "Invoices/AXENTRA_INV_AX26-1007.pdf",
      "Invoices/AXENTRA_INV_AX26-1008.pdf",
      "README.txt",
      "Receipts/2026-11-02_EXP-1A2B3C4D_Fuel_54.60.jpg",
      "Receipts/2026-11-02_EXP-1A2B3C4D_Fuel_54.60_2.jpg",
      "Sales_Invoices.csv",
      "Xero/README.txt",
      "Xero/Xero_Bills.csv",
      "Xero/Xero_Sales_Invoices.csv",
    ].sort((a, b) => a.localeCompare(b)));
    expect(pack.invoicePdfs).toBe(3);
    expect(pack.receiptFiles).toBe(2);
    expect(pack.problems).toEqual([]);
  });

  it("leaves the draft out of every file and says so in the README", async () => {
    const { zip, pack } = await build();
    expect(pack.summary.draftsExcluded).toBe(1);
    const sales = await zip.file("Sales_Invoices.csv")!.async("string");
    expect(sales).not.toContain("AX26-1009");
    expect(sales).toContain("CN26-0001,Credit note");
    expect(await zip.file("README.txt")!.async("string")).toContain("NOT INCLUDED: 1 draft invoice(s)");
    // income nets the cancelled invoice against its credit note
    expect(pack.summary.income).toBe(239.6);
  });

  it("puts only importable invoices in the Xero file and lists the rest for manual entry", async () => {
    const { zip } = await build();
    const xero = await zip.file("Xero/Xero_Sales_Invoices.csv")!.async("string");
    expect(xero.startsWith("*ContactName,")).toBe(true); // no BOM before the first header
    expect(xero).toContain("AX26-1007");
    expect(xero).not.toContain("AX26-1008");
    expect(xero).not.toContain("CN26-0001");
    const readme = await zip.file("Xero/README.txt")!.async("string");
    expect(readme).toContain("- AX26-1008");
    expect(readme).toContain("- CN26-0001");
  });

  it("the expenses list points at the receipt file that is in the ZIP", async () => {
    const { zip } = await build();
    const csv = await zip.file("Expenses.csv")!.async("string");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM so Excel reads £ correctly
    expect(csv).toContain("Receipts/2026-11-02_EXP-1A2B3C4D_Fuel_54.60");
    expect(csv).toContain(",AX26-1007,54.6,No,2,");
    expect(csv).toMatch(/,Yes,0,MISSING/);
  });

  it("can leave out the PDFs and receipts", async () => {
    const { files, pack } = await build({ includeInvoicePdfs: false, includeReceipts: false });
    expect(files.some((f) => f.startsWith("Invoices/") || f.startsWith("Receipts/"))).toBe(false);
    expect(pack.invoicePdfs).toBe(0);
    expect(h.getInvoicePdf).not.toHaveBeenCalled();
    expect(h.fetchReceiptBlob).not.toHaveBeenCalled();
  });

  it("lists anything it could not include in PROBLEMS.txt and still produces the pack", async () => {
    h.getInvoicePdf = vi.fn(async (r: Row) => {
      if (r.invoice_number === "AX26-1008") throw new Error("render failed");
      return new Blob(["pdf"]);
    });
    h.fetchReceiptBlob = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    const { pack, zip, files } = await build();
    expect(pack.problems).toEqual([
      "Invoice AX26-1008: PDF could not be produced",
      "Receipt 2026-11-02_EXP-1A2B3C4D_Fuel_54.60: file could not be downloaded",
    ]);
    expect(await zip.file("PROBLEMS.txt")!.async("string")).toContain("AX26-1008");
    expect(files).toContain("Receipts/2026-11-02_EXP-1A2B3C4D_Fuel_54.60_2.png");
  });

  it("reports progress through to completion", async () => {
    const seen: [number, number][] = [];
    await build({ onProgress: (d, t) => seen.push([d, t]) });
    expect(seen[0]).toEqual([0, 5]);
    expect(seen[seen.length - 1]).toEqual([5, 5]);
  });
});

describe("xeroReadme", () => {
  it("states the VAT position and whether anything needs entering by hand", () => {
    expect(xeroReadme([], false)).toContain("not VAT registered");
    expect(xeroReadme([], false)).toContain("Every issued invoice in this period is in the sales file.");
    const on = xeroReadme(["CN26-0001"], true);
    expect(on).toContain("is VAT registered");
    expect(on).toContain("  - CN26-0001");
  });
});
