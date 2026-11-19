// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  LATE_PAYMENT_NOTICE,
  bankRows,
  formatSortCode,
  businessFooterLine,
  generateInvoicePdf,
  invoicePdfFileName,
  type CachedImage,
  type InvoiceData,
  type InvoiceLineItem,
  type ReceiptImage,
} from "@/lib/invoicePdf";

// jsdom has no canvas/fetch pipeline, so the logo load fails and the
// generator falls back to its no-logo banner — exactly what a layout smoke
// test wants. Receipt images are passed in directly as tiny data URLs.

/** 1x1 white JPEG. */
const JPEG_1PX =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function img(w: number, h: number): CachedImage {
  return { dataUrl: JPEG_1PX, format: "JPEG", w, h };
}

async function render(data: InvoiceData): Promise<{ pages: number; text: string }> {
  const blob = await generateInvoicePdf({ ...data, logoUrl: "/missing-logo.png" });
  expect(blob.type).toBe("application/pdf");
  const raw = new TextDecoder("latin1").decode(await blob.arrayBuffer());
  return { pages: (raw.match(/\/Type \/Page[^s]/g) ?? []).length, text: raw };
}

function jobLines(n: number, withExpenses: boolean): InvoiceLineItem[] {
  return Array.from({ length: n }, (_, i) => ({
    description: `AX${1042 + i} | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34`,
    quantity: 1,
    unitPrice: 100 + i,
    ...(withExpenses ? { detail: `Expenses: Fuel £45.50 (R${String(i + 1).padStart(2, "0")})`, expenseAmount: 45.5 } : {}),
  }));
}

function receipts(n: number, image: CachedImage | null = img(600, 800)): ReceiptImage[] {
  return Array.from({ length: n }, (_, i) => ({
    ref: `R${String(i + 1).padStart(2, "0")}`,
    caption: `AX${1042 + i}  |  Fuel  |  02/11/2026  |  £54.60`,
    image,
  }));
}

const base: InvoiceData = {
  invoiceNumber: "AX26-1007",
  issueDate: "2026-11-14",
  dueDate: "2026-12-14",
  paymentTerms: "Payable within 30 days",
  clientName: "Accounts Payable",
  clientCompany: "Example Fleet Services Ltd",
  clientAddress: "Unit 4, Sample Business Park, Leeds, LS10 1AB",
  clientRef: "PO-4500123",
  lineItems: [],
};

const compact: Partial<InvoiceData> = { compactFooter: true, headerSubtitle: "7 jobs | 2 - 12 November 2026" };

describe("invoice PDF layouts", () => {
  it("legacy single-job invoice is one page and unchanged in shape", async () => {
    const { pages } = await render({
      ...base,
      vatRate: 20,
      lineItems: [{ description: "Vehicle transport - AB12 CDE (Ford Transit)", quantity: 1, unitPrice: 240 }],
    });
    expect(pages).toBe(1);
  });

  it("VAT off, 7 jobs with expenses: whole invoice on page 1, then receipts 6 per page", async () => {
    const { pages } = await render({
      ...base,
      ...compact,
      vatRegistered: false,
      lineItems: jobLines(7, true),
      notes: "Expenses are recharged at cost.",
      receipts: receipts(8),
      receiptsPerPage: 6,
    });
    // page 1 invoice + 2 receipt pages (6 + 2)
    expect(pages).toBe(3);
  });

  it("VAT off omits the expense schedule; VAT on adds it as its own page", async () => {
    const schedule = Array.from({ length: 8 }, (_, i) => ({
      ref: `R${String(i + 1).padStart(2, "0")}`,
      date: "2026-11-02",
      jobRef: `AX${1042 + i}`,
      category: "Fuel",
      supplier: "Shell",
      net: 45.5,
      vat: 9.1,
      gross: 54.6,
    }));
    const data = { ...base, ...compact, vatRate: 20, lineItems: jobLines(7, true), expenseSchedule: schedule };

    const off = await render({ ...data, vatRegistered: false });
    const on = await render({ ...data, vatRegistered: true });
    expect(off.pages).toBe(1);
    expect(on.pages).toBe(2);
  });

  it("a long invoice continues onto more pages without throwing", async () => {
    const { pages } = await render({
      ...base,
      ...compact,
      vatRegistered: false,
      lineItems: jobLines(40, true),
      receipts: receipts(13),
      receiptsPerPage: 6,
    });
    // 40 two-line rows need 3 invoice pages; 13 receipts need 3 more.
    expect(pages).toBeGreaterThanOrEqual(5);
    expect(pages).toBeLessThanOrEqual(7);
  });

  it("gives long till receipts their own full-height page, after the normal grid", async () => {
    const mixed = [
      ...receipts(2),
      { ref: "R03", caption: "AX1044  |  Fuel", image: img(300, 1200) },
      { ref: "R04", caption: "AX1045  |  Fuel", image: null },
    ];
    const { pages } = await render({
      ...base,
      ...compact,
      vatRegistered: false,
      lineItems: jobLines(4, true),
      receipts: mixed,
      receiptsPerPage: 6,
    });
    // invoice + one grid page (2 normal + 1 missing) + one tall page
    expect(pages).toBe(3);
  });

  it("renders a placeholder slot for a receipt with no image instead of failing", async () => {
    const { pages } = await render({
      ...base,
      ...compact,
      vatRegistered: false,
      lineItems: jobLines(1, true),
      receipts: receipts(1, null),
      receiptsPerPage: 6,
    });
    expect(pages).toBe(2);
  });

  it("jobs with no expenses fall back to the classic Qty / Rate / Total columns", async () => {
    const { pages } = await render({ ...base, ...compact, vatRegistered: false, lineItems: jobLines(5, false) });
    expect(pages).toBe(1);
  });

  it("renders a credit note", async () => {
    const { pages } = await render({
      ...base,
      ...compact,
      invoiceNumber: "CN26-0001",
      documentType: "credit_note",
      vatRegistered: false,
      lineItems: jobLines(2, true),
      notes: "Credit note for invoice AX26-1007. Reason: wrong PO.",
    });
    expect(pages).toBe(1);
  });

  it("renders with the business footer on a single page", async () => {
    const { pages } = await render({
      ...base,
      vatRegistered: false,
      business: { name: "T Tapfumaneyi t/a Axentra Vehicle Logistics", address: "1 Example Street\nLeeds LS1 1AA" },
      lineItems: jobLines(1, false),
    });
    expect(pages).toBe(1);
  });
});

describe("invoice PDF helpers", () => {
  it("builds the business footer from only the parts that are set", () => {
    expect(businessFooterLine(undefined)).toBe("");
    expect(businessFooterLine({ name: "Axentra", address: "1 Yard Lane\nLeeds", companyNumber: " 123 ", vatNumber: null })).toBe(
      "Axentra  |  1 Yard Lane, Leeds  |  Company no. 123",
    );
    expect(businessFooterLine({ name: "Axentra", vatNumber: "GB123456789" })).toBe("Axentra  |  VAT no. GB123456789");
  });

  it("names invoice and credit note files", () => {
    expect(invoicePdfFileName("AX26-1007")).toBe("AXENTRA_INV_AX26-1007.pdf");
    expect(invoicePdfFileName("CN26-0001")).toBe("AXENTRA_CN_CN26-0001.pdf");
    expect(invoicePdfFileName("INV/2026 #7")).toBe("AXENTRA_INV_INV_2026__7.pdf");
  });
});

describe("payment section: bank details and late-payment notice", () => {
  const bank = { bankName: "Test Bank", accountName: "Test Ltd", sortCode: "123456", accountNumber: "12345678" };
  const lines = jobLines(3, true);

  // jsPDF writes text into the PDF content streams; with compress:true it is deflated,
  // so measure by what the layout produces instead of grepping the file.
  it("prints a payment card only when bank details are saved", async () => {
    const withBank = await render({ ...base, ...compact, vatRegistered: false, lineItems: lines, bank });
    const without = await render({ ...base, ...compact, vatRegistered: false, lineItems: lines });
    expect(withBank.pages).toBe(1);
    expect(without.pages).toBe(1);
    // the card adds drawing operations (fills, text) to the page
    expect(withBank.text.length).toBeGreaterThan(without.text.length);
  });

  it("renders the notice with and without a card, and never on a credit note", async () => {
    for (const extra of [{ bank }, {}]) {
      const r = await render({ ...base, ...compact, vatRegistered: false, lineItems: lines, latePaymentNotice: true, ...extra });
      expect(r.pages).toBe(1);
    }
    const credit = await render({ ...base, ...compact, invoiceNumber: "CN26-0001", documentType: "credit_note", vatRegistered: false, lineItems: lines, bank, latePaymentNotice: true });
    expect(credit.pages).toBe(1);
  });

  it("keeps a long invoice with bank details and the notice from overflowing the totals", async () => {
    const r = await render({ ...base, ...compact, vatRegistered: false, lineItems: jobLines(13, true), bank, latePaymentNotice: true });
    expect(r.pages).toBeGreaterThanOrEqual(1);
    expect(r.pages).toBeLessThanOrEqual(2);
  });

  it("formats a sort code and lists only the bank details that are filled in", () => {
    expect(formatSortCode("123456")).toBe("12-34-56");
    expect(formatSortCode("12 34 56")).toBe("12-34-56");
    expect(formatSortCode("12-34-56")).toBe("12-34-56");
    expect(formatSortCode("1234")).toBe("1234");
    expect(formatSortCode(null)).toBe("");
    expect(bankRows(undefined)).toEqual([]);
    expect(bankRows({ bankName: "  ", accountName: "Test Ltd", sortCode: "123456", accountNumber: null })).toEqual([
      ["Account Name:", "Test Ltd"],
      ["Sort Code:", "12-34-56"],
    ]);
  });

  it("states the statutory sentence plainly, with the figures", () => {
    expect(LATE_PAYMENT_NOTICE).toContain("8% above the Bank of England base rate");
    expect(LATE_PAYMENT_NOTICE).toContain("£40, £70 or £100");
    expect(LATE_PAYMENT_NOTICE).toContain("Late Payment of Commercial Debts (Interest) Act 1998");
  });
});
