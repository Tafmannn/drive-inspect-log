/**
 * invoiceMath — pure calculations for multi-job invoices with rechargeable
 * expenses. No I/O, so every rule here is unit-tested directly.
 *
 * Rules:
 *   - One invoice row per job: transport price + that job's selected expenses.
 *   - VAT switch OFF (business not VAT registered): no VAT anywhere, and an
 *     expense is recharged at the full amount paid (the VAT on the receipt
 *     cannot be reclaimed, so it is a real cost).
 *   - VAT switch ON: an expense is recharged net of the VAT recorded on it,
 *     and VAT is then charged on the whole invoice at the invoice rate.
 *   - Receipt references (R01, R02 ...) are assigned once, in document order,
 *     and stored — they never change between downloads.
 */

export const DEFAULT_VAT_RATE = 20;

/** Round to pennies, avoiding binary-float drift (e.g. 1.005 -> 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface InvoiceJob {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_model: string;
  job_date: string | null;
  completed_at: string | null;
  total_price: number | null;
  pickup_city?: string | null;
  pickup_postcode?: string | null;
  delivery_city?: string | null;
  delivery_postcode?: string | null;
}

/** A stored receipt file. `backend_ref` is the durable storage path; `url` may be an expiring signed link. */
export interface ReceiptRef {
  url: string;
  backend?: string | null;
  backend_ref?: string | null;
}

export interface BillableExpense {
  id: string;
  job_id: string;
  date: string;
  category: string;
  supplier: string | null;
  label: string | null;
  /** Amount paid, including any VAT. */
  amount: number;
  /** VAT included in `amount`, if recorded. */
  vat_amount: number | null;
  receipts: ReceiptRef[];
}

export interface ExpenseCharge {
  gross: number;
  vat: number;
  charged: number;
}

export function chargeForExpense(e: Pick<BillableExpense, "amount" | "vat_amount">, vatRegistered: boolean): ExpenseCharge {
  const gross = round2(Number(e.amount) || 0);
  // VAT can never exceed what was paid; ignore nonsense values.
  const recorded = Number(e.vat_amount ?? 0);
  const vat = recorded > 0 && recorded < gross ? round2(recorded) : 0;
  return { gross, vat, charged: vatRegistered ? round2(gross - vat) : gross };
}

export function jobRef(job: Pick<InvoiceJob, "id" | "external_job_number">): string {
  return job.external_job_number?.trim() || job.id.slice(0, 8).toUpperCase();
}

/** "LS11" from "LS11 5AB" / "ls115ab". */
export function outwardCode(postcode: string | null | undefined): string {
  const pc = (postcode ?? "").trim().toUpperCase();
  if (!pc) return "";
  if (pc.includes(" ")) return pc.split(/\s+/)[0];
  return pc.length > 4 ? pc.slice(0, pc.length - 3) : pc;
}

/** "Leeds LS11 - Bristol BS34", or "" when the job has no usable addresses. */
export function jobRoute(job: InvoiceJob): string {
  const end = (city?: string | null, postcode?: string | null) =>
    [city?.trim(), outwardCode(postcode)].filter(Boolean).join(" ");
  const from = end(job.pickup_city, job.pickup_postcode);
  const to = end(job.delivery_city, job.delivery_postcode);
  return from && to ? `${from} - ${to}` : "";
}

export function fmtDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  // Date-only strings are parsed as local midnight to avoid a UTC day shift.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "JOB-1042 | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34" */
export function jobLineDescription(job: InvoiceJob): string {
  const vehicle = `${job.vehicle_make} ${job.vehicle_model}`.trim();
  return [
    jobRef(job),
    fmtDmy(job.job_date || job.completed_at),
    job.vehicle_reg,
    jobRoute(job) || vehicle,
  ]
    .filter(Boolean)
    .join(" | ");
}

/** Stored in invoices.line_items. Superset of the legacy multi-job shape. */
export interface StoredLineItem {
  description: string;
  /** Transport price for the job (legacy readers treat this as the line amount). */
  amount: number;
  quantity: number;
  sort_order: number;
  job_id?: string;
  job_ref?: string;
  /** yyyy-mm-dd the job was carried out (for the "N jobs | date range" header). */
  job_date?: string;
  vehicle_reg?: string;
  /** "Expenses: Fuel £54.60 (R01), Tolls £8.90 (R02)" */
  detail?: string;
  /** Rechargeable expenses for this job, as charged. */
  expense_amount?: number;
}

export interface DraftExpenseLine {
  expense_id: string;
  job_id: string;
  ref: string;
  sort_order: number;
  expense_date: string;
  category: string;
  supplier: string | null;
  amount_gross: number;
  amount_vat: number;
  amount_charged: number;
  receipts: ReceiptRef[];
}

export interface DraftItem {
  job_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

export interface InvoiceDraft {
  lineItems: StoredLineItem[];
  items: DraftItem[];
  expenseLines: DraftExpenseLine[];
  transportTotal: number;
  expensesTotal: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

/** The job's day as yyyy-mm-dd (local), or "" when it has no date. */
export function jobDay(j: Pick<InvoiceJob, "job_date" | "completed_at">): string {
  const iso = j.job_date || j.completed_at;
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "7 jobs | 2 - 12 November 2026" / "1 job | 2 November 2026" / "3 jobs | 28 October - 4 November 2026". */
export function jobsHeaderSubtitle(days: (string | null | undefined)[], jobCount: number): string {
  const count = `${jobCount} job${jobCount === 1 ? "" : "s"}`;
  const sorted = days.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort();
  if (!sorted.length) return count;
  const parse = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, d: Number(d.slice(8, 10)) });
  const a = parse(sorted[0]);
  const b = parse(sorted[sorted.length - 1]);
  const end = `${b.d} ${MONTHS[b.m]} ${b.y}`;
  if (sorted[0] === sorted[sorted.length - 1]) return `${count} | ${end}`;
  if (a.y === b.y && a.m === b.m) return `${count} | ${a.d} - ${end}`;
  if (a.y === b.y) return `${count} | ${a.d} ${MONTHS[a.m]} - ${end}`;
  return `${count} | ${a.d} ${MONTHS[a.m]} ${a.y} - ${end}`;
}

function jobSortKey(j: InvoiceJob): string {
  return `${jobDay(j) || "9999"}|${jobRef(j)}`;
}

export function formatRef(n: number): string {
  return `R${String(n).padStart(2, "0")}`;
}

function money(n: number): string {
  return `£${n.toFixed(2)}`;
}

/**
 * Build everything an invoice needs from the selected jobs and expenses.
 * Jobs are listed oldest first; expenses follow their job, then date.
 * Expenses for jobs that are not on the invoice are ignored.
 */
export function buildInvoiceDraft(input: {
  jobs: InvoiceJob[];
  expenses: BillableExpense[];
  vatRegistered: boolean;
  vatRate?: number;
}): InvoiceDraft {
  const vatRate = input.vatRegistered ? Math.max(0, Number(input.vatRate ?? DEFAULT_VAT_RATE)) : 0;
  const jobs = [...input.jobs].sort((a, b) => jobSortKey(a).localeCompare(jobSortKey(b)));
  const byJob = new Map<string, BillableExpense[]>();
  for (const e of input.expenses) {
    const list = byJob.get(e.job_id) ?? [];
    list.push(e);
    byJob.set(e.job_id, list);
  }

  const lineItems: StoredLineItem[] = [];
  const items: DraftItem[] = [];
  const expenseLines: DraftExpenseLine[] = [];
  let transportTotal = 0;
  let expensesTotal = 0;

  jobs.forEach((job, i) => {
    const transport = round2(Number(job.total_price ?? 0));
    const jobExpenses = (byJob.get(job.id) ?? []).sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );

    const parts: string[] = [];
    let jobExpenseTotal = 0;
    for (const e of jobExpenses) {
      const c = chargeForExpense(e, input.vatRegistered);
      const ref = formatRef(expenseLines.length + 1);
      expenseLines.push({
        expense_id: e.id,
        job_id: job.id,
        ref,
        sort_order: expenseLines.length,
        expense_date: e.date,
        category: e.category,
        supplier: e.supplier?.trim() || null,
        amount_gross: c.gross,
        amount_vat: c.vat,
        amount_charged: c.charged,
        receipts: e.receipts,
      });
      jobExpenseTotal += c.charged;
      parts.push(`${e.category} ${money(c.charged)} (${ref})`);
    }
    jobExpenseTotal = round2(jobExpenseTotal);

    const description = jobLineDescription(job);
    const detail = parts.length ? `Expenses: ${parts.join(", ")}` : undefined;

    lineItems.push({
      description,
      amount: transport,
      quantity: 1,
      sort_order: i,
      job_id: job.id,
      job_ref: jobRef(job),
      ...(jobDay(job) ? { job_date: jobDay(job) } : {}),
      vehicle_reg: job.vehicle_reg,
      ...(detail ? { detail, expense_amount: jobExpenseTotal } : {}),
    });
    // invoice_items carries the full line value so any reader that sums
    // items (e.g. the client portal table) agrees with the invoice subtotal.
    const lineTotal = round2(transport + jobExpenseTotal);
    items.push({
      job_id: job.id,
      description: detail ? `${description} - ${detail}` : description,
      quantity: 1,
      unit_price: lineTotal,
      amount: lineTotal,
      sort_order: i,
    });

    transportTotal += transport;
    expensesTotal += jobExpenseTotal;
  });

  transportTotal = round2(transportTotal);
  expensesTotal = round2(expensesTotal);
  const subtotal = round2(transportTotal + expensesTotal);
  const vatAmount = round2(subtotal * (vatRate / 100));
  return {
    lineItems,
    items,
    expenseLines,
    transportTotal,
    expensesTotal,
    subtotal,
    vatRate,
    vatAmount,
    total: round2(subtotal + vatAmount),
  };
}

/**
 * Days of credit from a free-text payment term: "Net 30" -> 30,
 * "Payable within 14 days" -> 14, "Due on receipt" -> 0. null if unknown.
 */
export function paymentTermDays(terms: string | null | undefined): number | null {
  const t = (terms ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/on receipt|immediate|upon receipt/.test(t)) return 0;
  const m = t.match(/(\d{1,3})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 365 ? n : null;
}

/** yyyy-mm-dd due date for an issue date + payment terms, or null. */
export function dueDateFor(issueDate: string, terms: string | null | undefined): string | null {
  const days = paymentTermDays(terms);
  if (days == null) return null;
  const d = new Date(`${issueDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Net 30" -> "Payable within 30 days"; other text is passed through. */
export function paymentTermsLabel(terms: string | null | undefined): string | undefined {
  const t = (terms ?? "").trim();
  if (!t) return undefined;
  const days = paymentTermDays(t);
  if (/^net\s*\d+$/i.test(t) && days != null) {
    return days === 0 ? "Payable on receipt" : `Payable within ${days} days`;
  }
  return t;
}

export type InvoiceDisplayStatus = "draft" | "sent" | "overdue" | "paid" | "cancelled";

/** 'overdue' is derived (sent + past its due date); it is never stored. */
export function displayStatus(
  inv: { status: string | null; due_date: string | null },
  today: string = new Date().toISOString().slice(0, 10),
): InvoiceDisplayStatus {
  const s = (inv.status ?? "draft") as InvoiceDisplayStatus;
  if (s === "sent" && inv.due_date && inv.due_date.slice(0, 10) < today) return "overdue";
  return s;
}
