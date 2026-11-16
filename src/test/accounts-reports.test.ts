// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  DEFAULT_XERO_CONFIG,
  XERO_BILLS_HEADERS,
  XERO_SALES_HEADERS,
  buildExpensesCsv,
  buildSalesCsv,
  buildXeroBillsRows,
  buildXeroSalesRows,
  expenseReceiptStem,
  expenseRef,
  monthOf,
  periodPresets,
  safeCell,
  summarise,
  taxQuartersOf,
  taxYearOf,
  vatThresholdStatus,
  xeroDate,
  xeroManualDocuments,
  type AccountExpense,
  type AccountInvoice,
} from "@/features/accounts/lib/accountsReports";
import { buildAccountsSheets } from "@/features/accounts/lib/accountsWorkbook";
import { buildXlsx, columnLetter, sheetName, xmlEscape } from "@/features/accounts/lib/xlsxLite";

function inv(over: Partial<AccountInvoice> & { invoice_number: string }): AccountInvoice {
  return {
    id: over.invoice_number,
    document_type: "invoice",
    status: "sent",
    issue_date: "2026-11-14",
    due_date: "2026-12-14",
    sent_at: "2026-11-14T10:00:00Z",
    paid_at: null,
    payment_method: null,
    payment_reference: null,
    client_id: "c1",
    client_name: "Chris",
    client_company: "CJE Transport",
    client_email: "accounts@cje.example",
    client_address: "1 Yard Lane\nLeeds",
    client_ref: "PO-1",
    subtotal: 343.5,
    expenses_total: 63.5,
    vat_rate: 0,
    vat_amount: 0,
    total: 343.5,
    vat_registered: false,
    cancel_reason: null,
    line_items: [
      { description: "AX1042 | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34", amount: 185, quantity: 1, sort_order: 0, detail: "Expenses: Fuel £54.60 (R01)", expense_amount: 54.6 },
      { description: "AX1043 | 03/11/2026 | XY69 ZZZ | Bristol BS34 - Cardiff CF11", amount: 95, quantity: 1, sort_order: 1, detail: "Expenses: Tolls £8.90 (R02)", expense_amount: 8.9 },
    ],
    ...over,
  };
}

function exp(over: Partial<AccountExpense> & { id: string }): AccountExpense {
  return {
    date: "2026-11-02",
    category: "Fuel",
    supplier: "Shell M1 J28",
    label: null,
    notes: null,
    amount: 54.6,
    vat_amount: 9.1,
    job_ref: "AX1042",
    vehicle_reg: "AB12 CDE",
    driver_name: "Sam",
    invoiced_on: null,
    amount_recharged: null,
    receipt_count: 1,
    ...over,
  };
}

describe("periods", () => {
  it("finds the UK tax year either side of 6 April", () => {
    expect(taxYearOf("2026-11-14")).toMatchObject({ from: "2026-04-06", to: "2027-04-05", label: "Tax year 2026/27" });
    expect(taxYearOf("2026-04-05")).toMatchObject({ from: "2025-04-06", to: "2026-04-05" });
    expect(taxYearOf("2026-04-06")).toMatchObject({ from: "2026-04-06", to: "2027-04-05" });
  });

  it("splits a tax year into the four MTD quarters", () => {
    expect(taxQuartersOf("2026-11-14").map((q) => [q.from, q.to])).toEqual([
      ["2026-04-06", "2026-07-05"],
      ["2026-07-06", "2026-10-05"],
      ["2026-10-06", "2027-01-05"],
      ["2027-01-06", "2027-04-05"],
    ]);
  });

  it("gives whole calendar months, including across a year end and February", () => {
    expect(monthOf("2026-11-14")).toMatchObject({ from: "2026-11-01", to: "2026-11-30", label: "November 2026" });
    expect(monthOf("2026-01-10", -1)).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(monthOf("2028-02-10")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("offers this month, last month, quarters so far, this and last tax year", () => {
    const labels = periodPresets("2026-11-14").map((p) => `${p.from}..${p.to}`);
    expect(labels).toEqual([
      "2026-11-01..2026-11-30",
      "2026-10-01..2026-10-31",
      "2026-10-06..2027-01-05",
      "2026-07-06..2026-10-05",
      "2026-04-06..2026-07-05",
      "2026-04-06..2027-04-05",
      "2025-04-06..2026-04-05",
    ]);
  });
});

describe("summarise", () => {
  const period = { from: "2026-11-01", to: "2026-11-30", label: "November 2026" };
  const invoices = [
    inv({ invoice_number: "AX26-1007" }),
    inv({ invoice_number: "AX26-1008", status: "paid", paid_at: "2026-11-20", subtotal: 100, expenses_total: 0, total: 100, client_company: "Fleetco" }),
    // issued, then cancelled by a credit note: the pair nets to zero
    inv({ invoice_number: "AX26-1009", status: "cancelled", subtotal: 200, expenses_total: 0, total: 200 }),
    inv({ invoice_number: "CN26-0001", document_type: "credit_note", subtotal: -200, expenses_total: 0, total: -200, due_date: null }),
    // never issued: not income
    inv({ invoice_number: "AX26-1010", status: "draft", sent_at: null, subtotal: 999, total: 999 }),
    inv({ invoice_number: "AX26-1011", status: "cancelled", sent_at: null, subtotal: 555, total: 555 }),
    // outside the period, still unpaid and overdue
    inv({ invoice_number: "AX26-1001", issue_date: "2026-08-01", due_date: "2026-08-31", subtotal: 50, expenses_total: 0, total: 50 }),
  ];
  const expenses = [
    exp({ id: "e1", invoiced_on: "AX26-1007", amount_recharged: 54.6 }),
    exp({ id: "e2", category: "Car Wash / Valet", amount: 12, vat_amount: null, receipt_count: 0 }),
    exp({ id: "e3", date: "2026-10-30", amount: 500 }),
  ];
  const s = summarise(invoices, expenses, period, "2026-11-30");

  it("counts only issued documents as income, net of credit notes", () => {
    expect(s.income).toBe(443.5); // 343.50 + 100 + 200 - 200
    expect(s.invoiceCount).toBe(3);
    expect(s.creditNoteCount).toBe(1);
    expect(s.draftsExcluded).toBe(1);
  });

  it("splits expenses into recharged and own cost, within the period only", () => {
    expect(s.expenses).toBe(66.6);
    expect(s.expensesRecharged).toBe(54.6);
    expect(s.expensesOwnCost).toBe(12);
    expect(s.profit).toBe(376.9);
    expect(s.expensesWithoutReceipt).toBe(1);
  });

  it("lists unpaid invoices from any period, oldest debt first, and never paid/cancelled/credit/draft", () => {
    expect(s.aged.map((a) => [a.invoice_number, a.daysOverdue, a.bucket])).toEqual([
      ["AX26-1001", 91, "Over 90 days"],
      ["AX26-1007", 0, "Not yet due"],
    ]);
    expect(s.outstanding).toBe(393.5);
  });

  it("totals income and unpaid per client", () => {
    expect(s.clients).toEqual([
      { client: "CJE Transport", invoices: 2, income: 343.5, outstanding: 343.5 },
      { client: "Fleetco", invoices: 1, income: 100, outstanding: 0 },
    ]);
  });

  it("rolls up by month", () => {
    expect(s.months).toEqual([
      { month: "2026-11", income: 443.5, vatCharged: 0, expenses: 66.6, expensesRecharged: 54.6, profit: 376.9 },
    ]);
  });
});

describe("vatThresholdStatus", () => {
  const year = (subtotal: number, issue_date = "2026-06-01") => [inv({ invoice_number: "A", subtotal, total: subtotal, issue_date })];

  it("measures issued income over the 12 months ending today", () => {
    const st = vatThresholdStatus(
      [
        ...year(40_000),
        inv({ invoice_number: "old", subtotal: 30_000, issue_date: "2025-11-14" }), // one day too old
        inv({ invoice_number: "edge", subtotal: 1_000, issue_date: "2025-11-15" }),
        inv({ invoice_number: "draft", subtotal: 9_999, status: "draft", sent_at: null }),
        inv({ invoice_number: "CN", document_type: "credit_note", subtotal: -500 }),
      ],
      "2026-11-14",
    );
    expect(st).toMatchObject({ turnover: 40_500, from: "2025-11-15", to: "2026-11-14", percent: 45, level: "ok" });
  });

  it("warns at 80% and 95%, and flags when exceeded", () => {
    expect(vatThresholdStatus(year(71_999), "2026-11-14").level).toBe("ok");
    expect(vatThresholdStatus(year(72_000), "2026-11-14").level).toBe("approaching");
    expect(vatThresholdStatus(year(85_500), "2026-11-14").level).toBe("close");
    expect(vatThresholdStatus(year(90_000), "2026-11-14").level).toBe("close");
    expect(vatThresholdStatus(year(90_000.01), "2026-11-14").level).toBe("exceeded");
  });
});

describe("generic CSVs", () => {
  it("references an expense and its receipt file consistently", () => {
    const e = exp({ id: "1a2b3c4d-aaaa-bbbb-cccc-000000000000", category: "Congestion/ULEZ/CAZ", amount: 12.5 });
    expect(expenseRef(e)).toBe("EXP-1A2B3C4D");
    expect(expenseReceiptStem(e)).toBe("2026-11-02_EXP-1A2B3C4D_Congestion-ULEZ-CAZ_12.50");
    const csv = buildExpensesCsv([e]);
    expect(csv).toContain("Receipts/2026-11-02_EXP-1A2B3C4D_Congestion-ULEZ-CAZ_12.50");
  });

  it("marks an expense with no receipt as MISSING and shows own cost vs recharged", () => {
    const rows = buildExpensesCsv([
      exp({ id: "e1", receipt_count: 0 }),
      exp({ id: "e2", invoiced_on: "AX26-1007", amount_recharged: 54.6 }),
    ]).split("\n");
    expect(rows[1]).toMatch(/,Yes,0,MISSING$/);
    expect(rows[2]).toContain(",AX26-1007,54.6,No,1,");
  });

  it("splits a sale into transport and recharged expenses", () => {
    const row = buildSalesCsv([inv({ invoice_number: "AX26-1007" })]).split("\n")[1];
    expect(row).toContain("AX26-1007,Invoice,sent,2026-11-14,2026-12-14,CJE Transport,PO-1,280,63.5,343.5,0,0,343.5");
  });

  it("neutralises spreadsheet formulas in free text but leaves numbers alone", () => {
    expect(safeCell("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(safeCell("+44 7700 900000")).toBe("'+44 7700 900000");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("-cmd")).toBe("'-cmd");
    expect(safeCell("-12.50")).toBe("-12.50");
    expect(safeCell(-12.5)).toBe(-12.5);
    expect(safeCell("Shell")).toBe("Shell");
    const csv = buildExpensesCsv([exp({ id: "e1", supplier: "=1+1" })]);
    expect(csv).toContain(",'=1+1,");
  });
});

describe("Xero sales import", () => {
  const col = (name: string) => XERO_SALES_HEADERS.indexOf(name);

  it("writes one row per job plus a row for its recharged expenses, tax exclusive", () => {
    const rows = buildXeroSalesRows([inv({ invoice_number: "AX26-1007" })], DEFAULT_XERO_CONFIG);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.length === XERO_SALES_HEADERS.length)).toBe(true);
    expect(rows.map((r) => [r[col("*InvoiceNumber")], r[col("*UnitAmount")], r[col("*AccountCode")]])).toEqual([
      ["AX26-1007", "185.00", "200"],
      ["AX26-1007", "54.60", "200"],
      ["AX26-1007", "95.00", "200"],
      ["AX26-1007", "8.90", "200"],
    ]);
    expect(rows[1][col("*Description")]).toBe("Recharged expenses - Expenses: Fuel £54.60 (R01)");
    // the rows of one invoice add up to its net total
    expect(rows.reduce((s, r) => s + Number(r[col("*UnitAmount")]), 0)).toBeCloseTo(343.5, 2);
  });

  it("fills contact, reference, UK dates and currency", () => {
    const [r] = buildXeroSalesRows([inv({ invoice_number: "AX26-1007" })], DEFAULT_XERO_CONFIG);
    expect(r[col("*ContactName")]).toBe("CJE Transport");
    expect(r[col("EmailAddress")]).toBe("accounts@cje.example");
    expect(r[col("POAddressLine1")]).toBe("1 Yard Lane, Leeds");
    expect(r[col("Reference")]).toBe("PO-1");
    expect(r[col("*InvoiceDate")]).toBe("14/11/2026");
    expect(r[col("*DueDate")]).toBe("14/12/2026");
    expect(r[col("*Quantity")]).toBe(1);
    expect(r[col("Currency")]).toBe("GBP");
  });

  it("uses No VAT while not registered and the standard sales rate once registered", () => {
    const off = buildXeroSalesRows([inv({ invoice_number: "A" })], DEFAULT_XERO_CONFIG);
    const on = buildXeroSalesRows([inv({ invoice_number: "B", vat_registered: true, vat_rate: 20 })], DEFAULT_XERO_CONFIG);
    expect(new Set(off.map((r) => r[col("*TaxType")]))).toEqual(new Set(["No VAT"]));
    expect(new Set(on.map((r) => r[col("*TaxType")]))).toEqual(new Set(["20% (VAT on Income)"]));
  });

  it("posts recharged expenses to their own account when configured", () => {
    const rows = buildXeroSalesRows([inv({ invoice_number: "A" })], { ...DEFAULT_XERO_CONFIG, rechargeAccount: "260" });
    expect(rows.map((r) => r[col("*AccountCode")])).toEqual(["200", "260", "200", "260"]);
  });

  it("leaves out drafts, cancelled invoices and credit notes, and reports the ones to enter by hand", () => {
    const docs = [
      inv({ invoice_number: "OK" }),
      inv({ invoice_number: "DRAFT", status: "draft", sent_at: null }),
      inv({ invoice_number: "CANCELLED", status: "cancelled" }),
      inv({ invoice_number: "CN26-0001", document_type: "credit_note" }),
    ];
    const rows = buildXeroSalesRows(docs, DEFAULT_XERO_CONFIG);
    expect(new Set(rows.map((r) => r[col("*InvoiceNumber")]))).toEqual(new Set(["OK"]));
    expect(xeroManualDocuments(docs).map((d) => d.invoice_number)).toEqual(["CANCELLED", "CN26-0001"]);
  });

  it("handles a legacy single-job invoice ({description, quantity, unitPrice})", () => {
    const rows = buildXeroSalesRows(
      [inv({ invoice_number: "AX26-1001", vat_registered: null, vat_rate: 0, line_items: [{ description: "Vehicle transport", quantity: 2, unitPrice: 120 }] })],
      DEFAULT_XERO_CONFIG,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][col("*UnitAmount")]).toBe("240.00");
    expect(rows[0][col("*TaxType")]).toBe("No VAT");
  });
});

describe("Xero bills import", () => {
  const col = (name: string) => XERO_BILLS_HEADERS.indexOf(name);

  it("writes one bill per expense at the gross amount, mapped to an account by category", () => {
    const rows = buildXeroBillsRows(
      [exp({ id: "1a2b3c4d-0000" }), exp({ id: "2b2b3c4d-0000", category: "Accommodation", supplier: null, amount: 80, vat_amount: null, job_ref: null }), exp({ id: "3c2b3c4d-0000", category: "Something new" })],
      DEFAULT_XERO_CONFIG,
      false,
    );
    expect(rows.every((r) => r.length === XERO_BILLS_HEADERS.length)).toBe(true);
    expect(rows.map((r) => [r[col("*ContactName")], r[col("*InvoiceNumber")], r[col("*UnitAmount")], r[col("*AccountCode")], r[col("*TaxType")]])).toEqual([
      ["Shell M1 J28", "EXP-1A2B3C4D", "54.60", "449", "No VAT"],
      ["Accommodation (supplier not recorded)", "EXP-2B2B3C4D", "80.00", "493", "No VAT"],
      ["Shell M1 J28", "EXP-3C2B3C4D", "54.60", "429", "No VAT"],
    ]);
    expect(rows[0][col("*InvoiceDate")]).toBe("02/11/2026");
    expect(rows[0][col("Description")]).toBe("Fuel - job AX1042");
  });

  it("claims VAT only once registered, and only where VAT is recorded", () => {
    const rows = buildXeroBillsRows(
      [exp({ id: "a-1" }), exp({ id: "b-2", category: "Congestion/ULEZ/CAZ", vat_amount: null })],
      DEFAULT_XERO_CONFIG,
      true,
    );
    expect(rows.map((r) => [r[col("*TaxType")], r[col("TaxAmount")]])).toEqual([
      ["20% (VAT on Expenses)", "9.10"],
      ["No VAT", ""],
    ]);
  });

  it("formats dates the UK way", () => {
    expect(xeroDate("2026-11-02")).toBe("02/11/2026");
    expect(xeroDate("2026-11-02T10:00:00Z")).toBe("02/11/2026");
    expect(xeroDate(null)).toBe("");
  });
});

describe("xlsxLite", () => {
  it("names columns and sheets the way Excel requires", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(sheetName("Income / by: client [2026]*?")).toBe("Income   by  client  2026");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName("///")).toBe("Sheet");
  });

  it("escapes XML and strips characters XML forbids", () => {
    expect(xmlEscape(`Tom & "Jerry" <ltd>\u0001`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;ltd&gt;");
  });

  it("builds a workbook whose parts are all present and consistent", async () => {
    const blob = await buildXlsx([
      { name: "Sales", headers: ["Number", "Total"], rows: [["AX26-1007", { money: 343.5 }], ["=SUM(A1)", 5]] },
      { name: "Sales", headers: ["A"], rows: [[null, "x"]] },
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/",
      "_rels/.rels",
      "xl/",
      "xl/_rels/",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    expect(workbook).toContain('<sheet name="Sales" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Sales 2" sheetId="2" r:id="rId2"/>');

    const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet1).toContain('<c r="B2" s="2"><v>343.5</v></c>');
    // user text is always an inline string, never a formula
    expect(sheet1).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=SUM(A1)</t></is></c>');
    expect(sheet1).not.toContain("<f>");
    // every sheet parses as XML
    for (const name of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/workbook.xml", "xl/styles.xml"]) {
      const doc = new DOMParser().parseFromString(await zip.file(name)!.async("string"), "application/xml");
      expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    }
  });

  it("builds the accounts workbook with its six tabs", async () => {
    const period = { from: "2026-11-01", to: "2026-11-30", label: "November 2026" };
    const invoices = [inv({ invoice_number: "AX26-1007" })];
    const expenses = [exp({ id: "e1", invoiced_on: "AX26-1007", amount_recharged: 54.6 })];
    const sheets = buildAccountsSheets(summarise(invoices, expenses, period, "2026-11-30"), invoices, expenses, {
      businessName: "Axentra",
      vatRegistered: false,
      generatedOn: "2026-11-30",
    });
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "By month", "Sales", "Income by client", "Expenses", "Unpaid invoices"]);
    // money columns on the Sales tab are numeric money cells
    expect(sheets[2].rows[0][sheets[2].headers.indexOf("Total")]).toEqual({ money: 343.5 });
    await expect(buildXlsx(sheets)).resolves.toBeInstanceOf(Blob);
  });
});
