/**
 * accountsReports — pure report + export builders for the accountant's pack
 * and accounting-software imports. No I/O; everything here is unit-tested.
 *
 * What counts as income: a document that was actually ISSUED (sent_at set) —
 * sent and paid invoices, credit notes (negative), and invoices that were
 * issued and later cancelled (their credit note nets them to zero). Drafts
 * and drafts-cancelled-before-issue never reach the books.
 */
import { buildCsv } from "@/features/exports/api/csvWriter";

export interface AccountInvoice {
  id: string;
  invoice_number: string;
  document_type: string | null; // 'invoice' | 'credit_note'
  status: string | null;
  issue_date: string; // yyyy-mm-dd
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  client_id: string | null;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  client_address: string | null;
  client_ref: string | null;
  subtotal: number;
  expenses_total: number;
  vat_rate: number | null;
  vat_amount: number | null;
  total: number;
  vat_registered: boolean | null;
  line_items: unknown;
  cancel_reason: string | null;
  credits_invoice_number?: string | null;
}

export interface AccountExpense {
  id: string;
  date: string; // yyyy-mm-dd
  category: string;
  supplier: string | null;
  label: string | null;
  notes: string | null;
  amount: number;
  vat_amount: number | null;
  job_ref: string | null;
  vehicle_reg: string | null;
  driver_name: string | null;
  /** Invoice number this expense was recharged on, if any. */
  invoiced_on: string | null;
  /** What the client was charged for it on that invoice. */
  amount_recharged: number | null;
  receipt_count: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Neutralise spreadsheet formula injection. Supplier names, labels and
 * reasons are free text typed by any user; a cell starting with = + @ (or
 * - followed by a non-digit) would be run as a formula when the accountant
 * opens the file. Prefixing an apostrophe makes the cell plain text.
 */
export function safeCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^[=+@\t\r]/.test(value) || /^-(?!\d)/.test(value) ? `'${value}` : value;
}

function safeRows(rows: unknown[][]): unknown[][] {
  return rows.map((r) => r.map(safeCell));
}

/* ── Periods ────────────────────────────────────────────────────── */

export interface Period {
  from: string; // yyyy-mm-dd inclusive
  to: string; // yyyy-mm-dd inclusive
  label: string;
}

function iso(y: number, m: number, d: number): string {
  // m is 1-based; Date.UTC normalises overflow (e.g. day 0 = last of prev month).
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

/** UK tax year containing `day`: 6 April – 5 April. */
export function taxYearOf(day: string): Period {
  const y = Number(day.slice(0, 4));
  const start = day >= `${y}-04-06` ? y : y - 1;
  return { from: `${start}-04-06`, to: `${start + 1}-04-05`, label: `Tax year ${start}/${String(start + 1).slice(2)}` };
}

/**
 * The four Making Tax Digital quarterly update periods of a tax year
 * (standard, non-calendar election): 6 Apr–5 Jul, 6 Jul–5 Oct,
 * 6 Oct–5 Jan, 6 Jan–5 Apr.
 */
export function taxQuartersOf(day: string): Period[] {
  const ty = taxYearOf(day);
  const y = Number(ty.from.slice(0, 4));
  const tag = `${y}/${String(y + 1).slice(2)}`;
  return [
    { from: `${y}-04-06`, to: `${y}-07-05`, label: `Q1 ${tag} (6 Apr - 5 Jul)` },
    { from: `${y}-07-06`, to: `${y}-10-05`, label: `Q2 ${tag} (6 Jul - 5 Oct)` },
    { from: `${y}-10-06`, to: `${y + 1}-01-05`, label: `Q3 ${tag} (6 Oct - 5 Jan)` },
    { from: `${y + 1}-01-06`, to: `${y + 1}-04-05`, label: `Q4 ${tag} (6 Jan - 5 Apr)` },
  ];
}

export function monthOf(day: string, offset = 0): Period {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) + offset;
  const from = iso(y, m, 1);
  const to = iso(y, m + 1, 0);
  const name = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from, to, label: name };
}

/** Preset periods offered in the UI, for a given "today". */
export function periodPresets(today: string): Period[] {
  const ty = taxYearOf(today);
  const prevTy = taxYearOf(iso(Number(ty.from.slice(0, 4)), 4, 5));
  const quarters = taxQuartersOf(today).filter((q) => q.from <= today);
  return [monthOf(today), monthOf(today, -1), ...quarters.reverse(), ty, prevTy];
}

export function inPeriod(day: string | null | undefined, p: Pick<Period, "from" | "to">): boolean {
  if (!day) return false;
  const d = day.slice(0, 10);
  return d >= p.from && d <= p.to;
}

/* ── Classification ─────────────────────────────────────────────── */

export function isCreditNote(inv: Pick<AccountInvoice, "document_type">): boolean {
  return inv.document_type === "credit_note";
}

/** Reached the books: it was issued at some point. */
export function wasIssued(inv: Pick<AccountInvoice, "sent_at" | "status">): boolean {
  return !!inv.sent_at || inv.status === "sent" || inv.status === "paid";
}

export function clientLabel(inv: Pick<AccountInvoice, "client_company" | "client_name">): string {
  return inv.client_company?.trim() || inv.client_name;
}

/** Amount still owed on a document (0 for paid, cancelled, drafts and credit notes). */
export function outstanding(inv: AccountInvoice): number {
  if (isCreditNote(inv) || inv.status !== "sent") return 0;
  return round2(inv.total);
}

/* ── Summaries ──────────────────────────────────────────────────── */

export interface MonthRow {
  month: string; // yyyy-mm
  income: number; // net of VAT, net of credit notes
  vatCharged: number;
  expenses: number; // all logged expenses, gross
  expensesRecharged: number; // of which recharged to clients
  profit: number; // income - expenses
}

export interface ClientRow {
  client: string;
  invoices: number;
  income: number;
  outstanding: number;
}

export interface AgedRow {
  invoice_number: string;
  client: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  daysOverdue: number; // 0 if not yet due / no due date
  bucket: "Not yet due" | "1-30 days" | "31-60 days" | "61-90 days" | "Over 90 days";
}

export interface AccountsSummary {
  period: Period;
  income: number;
  vatCharged: number;
  expenses: number;
  expensesRecharged: number;
  expensesOwnCost: number;
  profit: number;
  invoiceCount: number;
  creditNoteCount: number;
  outstanding: number;
  draftsExcluded: number;
  expensesWithoutReceipt: number;
  months: MonthRow[];
  clients: ClientRow[];
  aged: AgedRow[];
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

function ageBucket(daysOverdue: number): AgedRow["bucket"] {
  if (daysOverdue <= 0) return "Not yet due";
  if (daysOverdue <= 30) return "1-30 days";
  if (daysOverdue <= 60) return "31-60 days";
  if (daysOverdue <= 90) return "61-90 days";
  return "Over 90 days";
}

/**
 * Summarise a period. `invoices` and `expenses` may span more than the
 * period; only documents dated inside it are counted — except the aged
 * debt list, which is everything still unpaid as at `asOf`.
 */
export function summarise(
  invoices: AccountInvoice[],
  expenses: AccountExpense[],
  period: Period,
  asOf: string,
): AccountsSummary {
  const issued = invoices.filter((i) => wasIssued(i) && inPeriod(i.issue_date, period));
  const draftsExcluded = invoices.filter(
    (i) => !wasIssued(i) && i.status === "draft" && inPeriod(i.issue_date, period),
  ).length;
  const periodExpenses = expenses.filter((e) => inPeriod(e.date, period));

  const months = new Map<string, MonthRow>();
  const month = (day: string) => {
    const key = day.slice(0, 7);
    let row = months.get(key);
    if (!row) {
      row = { month: key, income: 0, vatCharged: 0, expenses: 0, expensesRecharged: 0, profit: 0 };
      months.set(key, row);
    }
    return row;
  };

  const clients = new Map<string, ClientRow>();
  for (const inv of issued) {
    const m = month(inv.issue_date);
    m.income += inv.subtotal;
    m.vatCharged += Number(inv.vat_amount ?? 0);

    const name = clientLabel(inv);
    const c = clients.get(name) ?? { client: name, invoices: 0, income: 0, outstanding: 0 };
    if (!isCreditNote(inv)) c.invoices += 1;
    c.income += inv.subtotal;
    c.outstanding += outstanding(inv);
    clients.set(name, c);
  }
  for (const e of periodExpenses) {
    const m = month(e.date);
    m.expenses += e.amount;
    if (e.invoiced_on) m.expensesRecharged += e.amount;
  }

  const monthRows = [...months.values()]
    .map((m) => ({
      month: m.month,
      income: round2(m.income),
      vatCharged: round2(m.vatCharged),
      expenses: round2(m.expenses),
      expensesRecharged: round2(m.expensesRecharged),
      profit: round2(m.income - m.expenses),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const aged: AgedRow[] = invoices
    .filter((i) => outstanding(i) > 0 && i.issue_date.slice(0, 10) <= asOf)
    .map((i) => {
      const daysOverdue = i.due_date ? Math.max(0, daysBetween(i.due_date, asOf)) : 0;
      return {
        invoice_number: i.invoice_number,
        client: clientLabel(i),
        issue_date: i.issue_date.slice(0, 10),
        due_date: i.due_date ? i.due_date.slice(0, 10) : null,
        total: round2(i.total),
        daysOverdue,
        bucket: ageBucket(daysOverdue),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.issue_date.localeCompare(b.issue_date));

  const income = round2(issued.reduce((s, i) => s + i.subtotal, 0));
  const expensesTotal = round2(periodExpenses.reduce((s, e) => s + e.amount, 0));
  const recharged = round2(periodExpenses.filter((e) => e.invoiced_on).reduce((s, e) => s + e.amount, 0));

  return {
    period,
    income,
    vatCharged: round2(issued.reduce((s, i) => s + Number(i.vat_amount ?? 0), 0)),
    expenses: expensesTotal,
    expensesRecharged: recharged,
    expensesOwnCost: round2(expensesTotal - recharged),
    profit: round2(income - expensesTotal),
    invoiceCount: issued.filter((i) => !isCreditNote(i)).length,
    creditNoteCount: issued.filter(isCreditNote).length,
    outstanding: round2(aged.reduce((s, a) => s + a.total, 0)),
    draftsExcluded,
    expensesWithoutReceipt: periodExpenses.filter((e) => e.receipt_count === 0).length,
    months: monthRows,
    clients: [...clients.values()]
      .map((c) => ({ ...c, income: round2(c.income), outstanding: round2(c.outstanding) }))
      .sort((a, b) => b.income - a.income || a.client.localeCompare(b.client)),
    aged,
  };
}

/* ── VAT registration threshold ─────────────────────────────────── */

/** UK VAT registration threshold (taxable turnover in any rolling 12 months). £90,000 since 1 April 2024. */
export const VAT_REGISTRATION_THRESHOLD = 90_000;

export interface VatThresholdStatus {
  /** Issued income (net of credit notes, excluding VAT) in the 12 months ending `asOf`. */
  turnover: number;
  threshold: number;
  percent: number;
  level: "ok" | "approaching" | "close" | "exceeded";
  from: string;
  to: string;
}

export function vatThresholdStatus(
  invoices: AccountInvoice[],
  asOf: string,
  threshold: number = VAT_REGISTRATION_THRESHOLD,
): VatThresholdStatus {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7));
  const d = Number(asOf.slice(8, 10));
  const from = iso(y - 1, m, d + 1);
  const turnover = round2(
    invoices
      .filter((i) => wasIssued(i) && inPeriod(i.issue_date, { from, to: asOf }))
      .reduce((s, i) => s + i.subtotal, 0),
  );
  const ratio = threshold > 0 ? turnover / threshold : 0;
  // The level is decided on the exact ratio; `percent` is rounded for display only.
  const percent = Math.round(ratio * 1000) / 10;
  const level = turnover > threshold ? "exceeded" : ratio >= 0.95 ? "close" : ratio >= 0.8 ? "approaching" : "ok";
  return { turnover, threshold, percent, level, from, to: asOf };
}

/* ── Generic CSVs ───────────────────────────────────────────────── */

export function expenseRef(e: Pick<AccountExpense, "id">): string {
  return `EXP-${e.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function safePart(v: string): string {
  return v.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** "2026-11-02_EXP-1A2B3C4D_Fuel_54.60" — same stem in Expenses.csv and the Receipts folder. */
export function expenseReceiptStem(e: Pick<AccountExpense, "id" | "date" | "category" | "amount">): string {
  return [e.date.slice(0, 10), expenseRef(e), safePart(e.category), e.amount.toFixed(2)].join("_");
}

export const SALES_HEADERS = [
  "Number", "Type", "Status", "Issue date", "Due date", "Client", "Client PO / ref",
  "Net (transport)", "Net (recharged expenses)", "Net total", "VAT rate %", "VAT", "Total",
  "Paid on", "Payment method", "Payment reference", "Credits invoice", "Cancel reason",
];

export function salesRows(invoices: AccountInvoice[]): unknown[][] {
  return safeRows([...invoices]
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.invoice_number.localeCompare(b.invoice_number))
    .map((i) => [
      i.invoice_number,
      isCreditNote(i) ? "Credit note" : "Invoice",
      i.status ?? "",
      i.issue_date.slice(0, 10),
      i.due_date?.slice(0, 10) ?? "",
      clientLabel(i),
      i.client_ref ?? "",
      round2(i.subtotal - i.expenses_total),
      round2(i.expenses_total),
      round2(i.subtotal),
      Number(i.vat_rate ?? 0),
      round2(Number(i.vat_amount ?? 0)),
      round2(i.total),
      i.paid_at?.slice(0, 10) ?? "",
      i.payment_method ?? "",
      i.payment_reference ?? "",
      i.credits_invoice_number ?? "",
      i.cancel_reason ?? "",
    ]));
}

export const EXPENSE_HEADERS = [
  "Ref", "Date", "Category", "Supplier", "Description", "Job", "Vehicle", "Driver",
  "Amount paid (gross)", "VAT on receipt", "Net", "Recharged on invoice", "Amount recharged",
  "Own cost", "Receipts", "Receipt file",
];

export function expenseRows(expenses: AccountExpense[]): unknown[][] {
  return safeRows([...expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((e) => {
      const vat = e.vat_amount != null && e.vat_amount > 0 && e.vat_amount < e.amount ? e.vat_amount : 0;
      return [
        expenseRef(e),
        e.date.slice(0, 10),
        e.category,
        e.supplier ?? "",
        e.label ?? e.notes ?? "",
        e.job_ref ?? "",
        e.vehicle_reg ?? "",
        e.driver_name ?? "",
        round2(e.amount),
        e.vat_amount == null ? "" : round2(vat),
        round2(e.amount - vat),
        e.invoiced_on ?? "",
        e.amount_recharged == null ? "" : round2(e.amount_recharged),
        e.invoiced_on ? "No" : "Yes",
        e.receipt_count,
        e.receipt_count > 0 ? `Receipts/${expenseReceiptStem(e)}` : "MISSING",
      ];
    }));
}

export function buildSalesCsv(invoices: AccountInvoice[]): string {
  return buildCsv(SALES_HEADERS, salesRows(invoices));
}

export function buildExpensesCsv(expenses: AccountExpense[]): string {
  return buildCsv(EXPENSE_HEADERS, expenseRows(expenses));
}

/* ── Xero ───────────────────────────────────────────────────────── */

export interface XeroConfig {
  /** Sales account code for transport income (Xero UK default chart: 200 Sales). */
  salesAccount: string;
  /** Sales account code for expenses recharged to clients. */
  rechargeAccount: string;
  /** Expense account code per expense category; `default` for anything unmapped. */
  expenseAccounts: Record<string, string>;
  /** Xero tax rate NAMES, exactly as they appear in the organisation's Tax Rates. */
  taxNoVat: string;
  taxSalesStandard: string;
  taxPurchasesStandard: string;
}

/** Codes from Xero's default UK chart of accounts. Every business should confirm these with its accountant. */
export const DEFAULT_XERO_CONFIG: XeroConfig = {
  salesAccount: "200",
  rechargeAccount: "200",
  expenseAccounts: {
    Fuel: "449",
    Tolls: "449",
    Parking: "449",
    "Congestion/ULEZ/CAZ": "449",
    "Car Wash / Valet": "449",
    "Maintenance / Tyres": "449",
    Accommodation: "493",
    "Food & Drink": "493",
    "Public Transport": "493",
    default: "429",
  },
  taxNoVat: "No VAT",
  taxSalesStandard: "20% (VAT on Income)",
  taxPurchasesStandard: "20% (VAT on Expenses)",
};

/** dd/mm/yyyy — how a UK Xero organisation reads dates on import. */
export function xeroDate(day: string | null | undefined): string {
  if (!day) return "";
  const d = day.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export const XERO_SALES_HEADERS = [
  "*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4",
  "POCity", "PORegion", "POPostalCode", "POCountry", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate",
  "Total", "InventoryItemCode", "*Description", "*Quantity", "*UnitAmount", "Discount", "*AccountCode",
  "*TaxType", "TaxAmount", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2", "Currency",
  "BrandingTheme",
];

interface StoredLine {
  description: string;
  amount: number;
  detail?: string;
  expenseAmount: number;
}

function storedLines(raw: unknown): StoredLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it, i) => ({
      description: typeof it.description === "string" && it.description ? it.description : "Line item",
      amount: round2(
        (Number(it.quantity ?? 1) || 1) * (Number(it.unitPrice ?? it.unit_price ?? it.amount ?? 0) || 0),
      ),
      detail: typeof it.detail === "string" && it.detail ? it.detail : undefined,
      expenseAmount: round2(Number(it.expense_amount ?? 0) || 0),
      order: Number(it.sort_order ?? i),
    }))
    .sort((a, b) => a.order - b.order);
}

/** Invoices that can go in a Xero sales import: issued, not cancelled, not a credit note. */
export function xeroImportableInvoices(invoices: AccountInvoice[]): AccountInvoice[] {
  return invoices.filter((i) => wasIssued(i) && !isCreditNote(i) && i.status !== "cancelled");
}

/** Issued documents Xero's CSV import cannot take; they need entering by hand. */
export function xeroManualDocuments(invoices: AccountInvoice[]): AccountInvoice[] {
  return invoices.filter((i) => wasIssued(i) && (isCreditNote(i) || i.status === "cancelled"));
}

/**
 * Xero "Import sales invoices" CSV. One row per invoice line; rows sharing
 * an InvoiceNumber become one invoice. Amounts are tax-EXCLUSIVE (choose
 * "Tax Exclusive" in Xero's import dialog). A job's recharged expenses are
 * a separate line so they can post to their own account.
 */
export function buildXeroSalesRows(invoices: AccountInvoice[], cfg: XeroConfig): unknown[][] {
  const rows: unknown[][] = [];
  const sorted = xeroImportableInvoices(invoices).sort(
    (a, b) => a.issue_date.localeCompare(b.issue_date) || a.invoice_number.localeCompare(b.invoice_number),
  );
  for (const inv of sorted) {
    const charged = inv.vat_registered === true || (inv.vat_registered == null && Number(inv.vat_rate ?? 0) > 0);
    const taxType = charged && Number(inv.vat_rate ?? 0) > 0 ? cfg.taxSalesStandard : cfg.taxNoVat;
    const line = (description: string, amount: number, account: string) => [
      clientLabel(inv), inv.client_email ?? "", inv.client_address?.replace(/\s*\n\s*/g, ", ") ?? "", "", "", "",
      "", "", "", "", inv.invoice_number, inv.client_ref ?? "", xeroDate(inv.issue_date),
      xeroDate(inv.due_date || inv.issue_date), "", "", description, 1, amount.toFixed(2), "", account,
      taxType, "", "", "", "", "", "GBP", "",
    ];
    for (const l of storedLines(inv.line_items)) {
      rows.push(line(l.description, l.amount, cfg.salesAccount));
      if (l.expenseAmount !== 0) {
        rows.push(line(`Recharged expenses - ${l.detail ?? l.description}`, l.expenseAmount, cfg.rechargeAccount));
      }
    }
  }
  return safeRows(rows);
}

export function buildXeroSalesCsv(invoices: AccountInvoice[], cfg: XeroConfig = DEFAULT_XERO_CONFIG): string {
  return buildCsv(XERO_SALES_HEADERS, buildXeroSalesRows(invoices, cfg));
}

export const XERO_BILLS_HEADERS = [
  "*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4",
  "POCity", "PORegion", "POPostalCode", "POCountry", "*InvoiceNumber", "*InvoiceDate", "*DueDate", "Total",
  "InventoryItemCode", "Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "TaxAmount",
  "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2", "Currency",
];

/**
 * Xero "Import bills" CSV, one bill per expense. Amounts are the GROSS paid
 * (choose "Tax Inclusive" in Xero's import dialog). While the business is
 * not VAT registered every line is "No VAT"; once registered, an expense
 * with VAT recorded uses the standard purchases rate.
 */
export function buildXeroBillsRows(expenses: AccountExpense[], cfg: XeroConfig, vatRegistered: boolean): unknown[][] {
  return safeRows([...expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((e) => {
      const hasVat = vatRegistered && e.vat_amount != null && e.vat_amount > 0 && e.vat_amount < e.amount;
      const description = [e.category, e.job_ref ? `job ${e.job_ref}` : "", e.label ?? ""].filter(Boolean).join(" - ");
      return [
        e.supplier?.trim() || `${e.category} (supplier not recorded)`, "", "", "", "", "",
        "", "", "", "", expenseRef(e), xeroDate(e.date), xeroDate(e.date), "",
        "", description, 1, e.amount.toFixed(2),
        cfg.expenseAccounts[e.category] ?? cfg.expenseAccounts.default ?? "",
        hasVat ? cfg.taxPurchasesStandard : cfg.taxNoVat, hasVat ? e.vat_amount!.toFixed(2) : "",
        "", "", "", "", "GBP",
      ];
    }));
}

export function buildXeroBillsCsv(
  expenses: AccountExpense[],
  cfg: XeroConfig = DEFAULT_XERO_CONFIG,
  vatRegistered = false,
): string {
  return buildCsv(XERO_BILLS_HEADERS, buildXeroBillsRows(expenses, cfg, vatRegistered));
}
