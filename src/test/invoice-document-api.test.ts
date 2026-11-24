// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

/**
 * Reading an invoice back into its document: business settings, the
 * recharged expenses + their receipt files, the pack ZIP, and how receipt
 * files are resolved and fetched.
 */
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string } | undefined>,
  signed: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  resolveMedia: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  download: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("@/integrations/supabase/client", () => {
  function query(table: string) {
    const result = () => ({ data: h.errors[table] ? null : h.tables[table] ?? [], error: h.errors[table] ?? null });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "gte", "lte", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = () =>
      Promise.resolve({ data: h.errors[table] ? null : (h.tables[table] ?? [])[0] ?? null, error: h.errors[table] ?? null });
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    return chain;
  }
  return {
    supabase: {
      from: (table: string) => query(table),
      storage: {
        from: () => ({
          createSignedUrl: (...a: unknown[]) => h.signed(...a),
          download: (...a: unknown[]) => h.download(...a),
        }),
      },
    },
  };
});

vi.mock("@/lib/mediaResolver", () => ({
  resolveMediaUrlAsync: (...a: unknown[]) => h.resolveMedia(...a),
}));

import {
  buildInvoiceDocument,
  fetchInvoiceExpenseLines,
  fetchOrgInvoiceSettings,
  generateInvoiceDocumentPdf,
  settingsToPdfFields,
} from "@/features/invoicing/api/invoiceDocument";
import { fetchBillableExpenses } from "@/features/invoicing/api/billableExpenses";
import { buildInvoicePack } from "@/features/invoicing/api/receiptExport";
import { fetchReceiptBlob, loadReceiptImage, resolveReceiptUrl } from "@/features/invoicing/api/receiptImages";
import type { InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";

const LINE_ITEMS = [
  { description: "AX1042 | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34", amount: 185, quantity: 1, sort_order: 0, job_id: "j1", job_ref: "AX1042", job_date: "2026-11-02", vehicle_reg: "AB12 CDE", detail: "Expenses: Fuel £54.60 (R01), Tolls £8.90 (R02)", expense_amount: 63.5 },
];

function record(over: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv-1", org_id: "org-1", invoice_number: "AX26-1007", client_name: "Chris", client_company: "CJE Transport",
    client_email: null, client_address: null, issue_date: "2026-11-14", due_date: null, payment_terms: null,
    line_items: LINE_ITEMS, subtotal: 248.5, vat_rate: 0, vat_amount: 0, total: 248.5, notes: null, status: "draft",
    created_at: "2026-11-14", vat_registered: false, document_type: "invoice",
    ...over,
  };
}

const EXPENSE_LINES = [
  { id: "l1", expense_id: "e1", job_id: "j1", ref: "R01", sort_order: 0, expense_date: "2026-11-02", category: "Fuel", supplier: "Shell", amount_gross: "54.60", amount_vat: "9.10", amount_charged: "54.60" },
  { id: "l2", expense_id: "e2", job_id: "j1", ref: "R02", sort_order: 1, expense_date: "2026-11-02", category: "Tolls", supplier: null, amount_gross: "8.90", amount_vat: "0", amount_charged: "8.90" },
  // the underlying expense was deleted: the snapshot line remains, with no receipt to fetch
  { id: "l3", expense_id: null, job_id: null, ref: "R03", sort_order: 2, expense_date: "2026-11-03", category: "Parking", supplier: null, amount_gross: "9.00", amount_vat: "0", amount_charged: "9.00" },
];
const RECEIPTS = [
  { expense_id: "e1", url: "https://signed.example/old-1", backend: "supabase", backend_ref: "e1/a.jpg", created_at: "2026-11-02T10:00:00Z" },
  { expense_id: "e1", url: "https://signed.example/old-2", backend: "supabase", backend_ref: "e1/b.jpg", created_at: "2026-11-02T10:05:00Z" },
];

beforeEach(() => {
  h.tables = {};
  h.errors = {};
  h.signed = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/fresh" }, error: null });
  h.resolveMedia = vi.fn(async (url: string) => `resolved:${url}`);
  h.download = vi.fn().mockResolvedValue({ data: new Blob(["stored-pdf"]), error: null });
  // A minimal fetch response: jsdom's Blob and Node's Response don't mix.
  vi.stubGlobal("fetch", vi.fn(async () => respond(new Blob(["img"], { type: "image/jpeg" }))));
});

function respond(blob: Blob | null, status = 200) {
  return { ok: status >= 200 && status < 300, status, blob: async () => blob };
}

describe("fetchOrgInvoiceSettings", () => {
  it("reads the VAT switch and the business identity, preferring legal name and trading address", async () => {
    h.tables.organisations = [{ name: "Axentra Vehicles", legal_name: "T Example t/a Axentra", branding_name: "Axentra", trading_address: "1 Yard Lane", registered_address: "Reg Office", company_number: "123", vat_number: "GB1", vat_registered: true, bank_name: "Test Bank", bank_account_name: "Test Ltd", bank_sort_code: "12-34-56", bank_account_number: "12345678", late_payment_notice: true }];
    await expect(fetchOrgInvoiceSettings("org-1")).resolves.toEqual({
      vatRegistered: true,
      business: { name: "T Example t/a Axentra", address: "1 Yard Lane", companyNumber: "123", vatNumber: "GB1" },
      bank: { bankName: "Test Bank", accountName: "Test Ltd", sortCode: "12-34-56", accountNumber: "12345678" },
      latePaymentNotice: true,
    });
  });

  it("never prints a VAT number while the business is not VAT registered, and falls back through names/addresses", async () => {
    h.tables.organisations = [{ name: "Axentra Vehicles", legal_name: null, branding_name: null, trading_address: null, registered_address: "Reg Office", company_number: null, vat_number: "GB1", vat_registered: false }];
    await expect(fetchOrgInvoiceSettings("org-1")).resolves.toEqual({
      vatRegistered: false,
      business: { name: "Axentra Vehicles", address: "Reg Office", companyNumber: null, vatNumber: null },
      bank: { bankName: null, accountName: null, sortCode: null, accountNumber: null },
      latePaymentNotice: true, // on unless explicitly switched off
    });
  });

  it("switches the late-payment notice off only when the organisation says so", async () => {
    h.tables.organisations = [{ name: "A", late_payment_notice: false }];
    await expect(fetchOrgInvoiceSettings("org-1")).resolves.toMatchObject({ latePaymentNotice: false });
  });

  it("turns settings into invoice PDF fields, leaving out what is off or missing", () => {
    expect(settingsToPdfFields(null)).toEqual({});
    expect(settingsToPdfFields({ vatRegistered: false, business: { name: "A" } })).toEqual({ business: { name: "A" } });
    expect(
      settingsToPdfFields({ vatRegistered: false, business: { name: "A" }, bank: { sortCode: "12-34-56" }, latePaymentNotice: false }),
    ).toEqual({ business: { name: "A" }, bank: { sortCode: "12-34-56" } });
    expect(
      settingsToPdfFields({ vatRegistered: false, business: { name: "A" }, latePaymentNotice: true }),
    ).toEqual({ business: { name: "A" }, latePaymentNotice: true });
  });

  it("carries the bank details and notice onto the invoice document", async () => {
    const data = await buildInvoiceDocument(record(), {
      settings: { vatRegistered: false, business: { name: "Axentra" }, bank: { accountNumber: "12345678" }, latePaymentNotice: true },
    });
    expect(data).toMatchObject({ bank: { accountNumber: "12345678" }, latePaymentNotice: true });
  });

  it("treats a missing organisation as not VAT registered, and surfaces a read error", async () => {
    h.tables.organisations = [];
    await expect(fetchOrgInvoiceSettings("org-1")).resolves.toMatchObject({ vatRegistered: false });
    h.errors.organisations = { message: "column vat_registered does not exist" };
    await expect(fetchOrgInvoiceSettings("org-1")).rejects.toThrow(/Could not load organisation settings/);
  });
});

describe("fetchInvoiceExpenseLines", () => {
  it("returns the snapshot lines as numbers with each expense's receipt files", async () => {
    h.tables.invoice_expenses = EXPENSE_LINES;
    h.tables.expense_receipts = RECEIPTS;
    const lines = await fetchInvoiceExpenseLines("inv-1");
    expect(lines.map((l) => [l.ref, l.amount_gross, l.amount_vat, l.amount_charged, l.receipts.length])).toEqual([
      ["R01", 54.6, 9.1, 54.6, 2],
      ["R02", 8.9, 0, 8.9, 0],
      ["R03", 9, 0, 9, 0],
    ]);
    expect(lines[0].receipts[0]).toEqual({ url: "https://signed.example/old-1", backend: "supabase", backend_ref: "e1/a.jpg" });
  });

  it("surfaces a read error", async () => {
    h.errors.invoice_expenses = { message: "denied" };
    await expect(fetchInvoiceExpenseLines("inv-1")).rejects.toThrow(/Could not load invoice expenses: denied/);
  });
});

describe("buildInvoiceDocument", () => {
  it("adds the business footer and nothing else when no expenses were recharged", async () => {
    const data = await buildInvoiceDocument(record(), { settings: { vatRegistered: false, business: { name: "Axentra" } } });
    expect(data.business).toEqual({ name: "Axentra" });
    expect(data.expenseSchedule).toBeUndefined();
    expect(data.receipts).toBeUndefined();
  });

  it("builds the schedule and a receipt slot per file — and an empty slot where there is no file", async () => {
    h.tables.invoice_expenses = EXPENSE_LINES;
    h.tables.expense_receipts = RECEIPTS;
    const data = await buildInvoiceDocument(record(), { withReceipts: true });

    expect(data.expenseSchedule?.map((r) => [r.ref, r.jobRef, r.vehicleReg, r.net, r.vat, r.gross])).toEqual([
      ["R01", "AX1042", "AB12 CDE", 54.6, 9.1, 54.6],
      ["R02", "AX1042", "AB12 CDE", 8.9, 0, 8.9],
      ["R03", "-", undefined, 9, 0, 9],
    ]);
    // jsdom cannot decode images, so every slot is a placeholder — but the
    // slots, refs and captions are what matter here.
    expect(data.receipts?.map((r) => [r.ref, r.caption, r.image])).toEqual([
      ["R01", "AX1042  |  Fuel  |  02/11/2026  |  £54.60", null],
      ["R01b", "AX1042  |  Fuel  |  02/11/2026  |  £54.60", null],
      ["R02", "AX1042  |  Tolls  |  02/11/2026  |  £8.90", null],
      ["R03", "Parking  |  03/11/2026  |  £9.00", null],
    ]);
    expect(data.receiptsPerPage).toBe(6);
  });

  it("can skip loading receipt images", async () => {
    h.tables.invoice_expenses = EXPENSE_LINES;
    const data = await buildInvoiceDocument(record(), { withReceipts: false });
    expect(data.expenseSchedule).toHaveLength(3);
    expect(data.receipts).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives a credit note no schedule or receipts, without reading them", async () => {
    h.errors.invoice_expenses = { message: "must not be read" };
    const data = await buildInvoiceDocument(record({ document_type: "credit_note", invoice_number: "CN26-0001" }));
    expect(data.documentType).toBe("credit_note");
    expect(data.expenseSchedule).toBeUndefined();
  });

  it("renders the full document to a PDF", async () => {
    h.tables.invoice_expenses = EXPENSE_LINES;
    h.tables.expense_receipts = RECEIPTS;
    const blob = await generateInvoiceDocumentPdf(record(), { vatRegistered: false, business: { name: "Axentra" } });
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
  });
});

describe("fetchBillableExpenses", () => {
  it("returns visible expenses with their receipts, leaving out any already on an invoice", async () => {
    h.tables.expenses = [
      { id: "e1", job_id: "j1", date: "2026-11-02", category: "Fuel", label: null, amount: "54.60", supplier: "Shell", vat_amount: "9.10" },
      { id: "e2", job_id: "j1", date: "2026-11-02", category: "Tolls", label: "M6", amount: "8.90", supplier: null, vat_amount: null },
      { id: "e3", job_id: "j2", date: "2026-11-03", category: "Fuel", label: null, amount: "40", supplier: null, vat_amount: null },
    ];
    h.tables.expense_receipts = RECEIPTS;
    h.tables.invoice_expenses = [
      { expense_id: "e3", voided: false }, // on a live invoice: excluded
      { expense_id: "e2", voided: true },  // its invoice was cancelled: offered again
    ];
    const out = await fetchBillableExpenses(["j1", "j2"]);
    expect(out.map((e) => [e.id, e.amount, e.vat_amount, e.receipts.length])).toEqual([
      ["e1", 54.6, 9.1, 2],
      ["e2", 8.9, null, 0],
    ]);
  });

  it("does not query for no jobs, and returns nothing when there are no expenses", async () => {
    await expect(fetchBillableExpenses([])).resolves.toEqual([]);
    h.tables.expenses = [];
    await expect(fetchBillableExpenses(["j1"])).resolves.toEqual([]);
  });

  it("surfaces read errors", async () => {
    h.errors.expenses = { message: "boom" };
    await expect(fetchBillableExpenses(["j1"])).rejects.toThrow(/Could not load expenses: boom/);
    h.errors = { expense_receipts: { message: "no receipts" } };
    h.tables.expenses = [{ id: "e1", job_id: "j1", date: "2026-11-02", category: "Fuel", label: null, amount: 1, supplier: null, vat_amount: null }];
    await expect(fetchBillableExpenses(["j1"])).rejects.toThrow(/Could not load receipts: no receipts/);
  });
});

describe("receipt files", () => {
  it("signs a fresh link from the permanent storage path instead of the saved (expiring) URL", async () => {
    await expect(resolveReceiptUrl(RECEIPTS[0])).resolves.toBe("https://signed.example/fresh");
    expect(h.signed).toHaveBeenCalledWith("e1/a.jpg", expect.any(Number));
    expect(h.resolveMedia).not.toHaveBeenCalled();
  });

  it("falls back to the saved URL for legacy rows, or when signing fails or throws", async () => {
    await expect(resolveReceiptUrl({ url: "legacy/path.jpg", backend: "internal", backend_ref: null })).resolves.toBe("resolved:legacy/path.jpg");
    h.signed.mockResolvedValueOnce({ data: null, error: { message: "gone" } });
    await expect(resolveReceiptUrl(RECEIPTS[0])).resolves.toBe("resolved:https://signed.example/old-1");
    h.signed.mockRejectedValueOnce(new Error("network"));
    await expect(resolveReceiptUrl(RECEIPTS[0])).resolves.toBe("resolved:https://signed.example/old-1");
  });

  it("returns null rather than throwing when a receipt cannot be fetched", async () => {
    h.resolveMedia.mockResolvedValueOnce(null);
    await expect(fetchReceiptBlob({ url: "x" })).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => respond(null, 404)));
    await expect(fetchReceiptBlob({ url: "x" })).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchReceiptBlob({ url: "x" })).resolves.toBeNull();
  });

  it("does not try to embed a PDF receipt as an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(new Blob(["%PDF"], { type: "application/pdf" }))));
    await expect(loadReceiptImage({ url: "x.pdf" })).resolves.toBeNull();
  });
});

describe("buildInvoicePack", () => {
  it("puts receipts beside a clean draft invoice, not on duplicate PDF pages", async () => {
    h.tables.invoice_expenses = [EXPENSE_LINES[0]];
    h.tables.expense_receipts = RECEIPTS;
    const pack = await buildInvoicePack(record());
    const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
    const pdf = await zip.file("AXENTRA_INV_AX26-1007.pdf")!.async("string");
    expect((pdf.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
    expect(pack.succeeded).toBe(2);
    expect(pack.failed).toEqual([]);
  });

  it("deduplicates identical receipt references for the same expense", async () => {
    h.tables.invoice_expenses = [EXPENSE_LINES[0]];
    h.tables.expense_receipts = [RECEIPTS[0], RECEIPTS[0]];
    const pack = await buildInvoicePack(record({ status: "sent", pdf_url: "p.pdf" }));
    expect(pack.succeeded).toBe(1);
    expect(pack.failed).toEqual([]);
    const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((n) => n.startsWith("receipts/") && !n.endsWith("/"))).toHaveLength(1);
  });

  it("fails instead of replacing an unreadable issued PDF with a new render", async () => {
    h.download.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(buildInvoicePack(record({ status: "sent", pdf_url: "p.pdf" }))).rejects.toThrow(/original issued invoice PDF/);
  });

  it("surfaces receipt query errors instead of treating them as missing files", async () => {
    h.tables.invoice_expenses = [EXPENSE_LINES[0]];
    h.errors.expense_receipts = { message: "denied" };
    await expect(buildInvoicePack(record())).rejects.toThrow(/Could not load invoice receipts: denied/);
  });

  it("zips the invoice PDF with only that invoice's receipt files, named by receipt ref", async () => {
    h.tables.invoice_expenses = EXPENSE_LINES;
    h.tables.expense_receipts = RECEIPTS;
    const progress: [number, number][] = [];
    const pack = await buildInvoicePack(record({ status: "sent", pdf_url: "org-1/AXENTRA_INV_AX26-1007.pdf" }), null, (d, t) => progress.push([d, t]));

    expect(pack.fileName).toBe("invoice_pack_AX26-1007.zip");
    expect(pack.succeeded).toBe(2);
    expect(pack.failed).toEqual(["R02 (no receipt on file)", "R03 (no receipt on file)"]);
    expect(progress[progress.length - 1]).toEqual([4, 4]);

    const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((n) => !n.endsWith("/")).sort((a, b) => a.localeCompare(b))).toEqual([
      "AXENTRA_INV_AX26-1007.pdf",
      "receipts/R01_AX1042_Fuel_54.60.jpg",
      "receipts/R01b_AX1042_Fuel_54.60.jpg",
    ]);
    // the issued invoice's stored PDF is what goes in the pack
    expect(await zip.file("AXENTRA_INV_AX26-1007.pdf")!.async("string")).toBe("stored-pdf");
  });

  it("reports a receipt that fails to download instead of dropping it silently", async () => {
    h.tables.invoice_expenses = [EXPENSE_LINES[0]];
    h.tables.expense_receipts = [RECEIPTS[0]];
    vi.stubGlobal("fetch", vi.fn(async () => respond(null, 500)));
    const pack = await buildInvoicePack(record({ status: "sent", pdf_url: "p.pdf" }));
    expect(pack.succeeded).toBe(0);
    expect(pack.failed).toEqual(["R01 (download failed)"]);
    const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(["AXENTRA_INV_AX26-1007.pdf"]);
  });

  it("contains just the PDF when nothing was recharged", async () => {
    const pack = await buildInvoicePack(record({ status: "sent", pdf_url: "p.pdf" }));
    const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(["AXENTRA_INV_AX26-1007.pdf"]);
    expect(pack.failed).toEqual([]);
  });
});
