/**
 * Client-facing payment state of an invoice, and the account balance built
 * from it. Pure functions so the rules are unit-tested and shared by the
 * invoice list, the invoice page and the moves overview.
 */
import type { PortalInvoiceSummary } from "../api";

export type InvoicePaymentState =
  | "credit_note"
  | "cancelled"
  | "paid"
  | "overdue"
  | "due_today"
  | "due"
  | "issued"; // sent, no due date

type InvoiceLike = Pick<PortalInvoiceSummary, "status" | "document_type" | "due_date" | "total">;

/** Local calendar day "YYYY-MM-DD" (due dates are plain dates, not instants). */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole days from `fromDay` to `toDay` (both YYYY-MM-DD); negative when toDay is earlier. */
export function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.UTC(+fromDay.slice(0, 4), +fromDay.slice(5, 7) - 1, +fromDay.slice(8, 10));
  const b = Date.UTC(+toDay.slice(0, 4), +toDay.slice(5, 7) - 1, +toDay.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function invoicePaymentState(inv: InvoiceLike, today: Date = new Date()): InvoicePaymentState {
  if (inv.document_type === "credit_note") return "credit_note";
  if (inv.status === "cancelled") return "cancelled";
  if (inv.status === "paid") return "paid";
  const due = inv.due_date?.slice(0, 10);
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return "issued";
  const diff = daysBetween(localDay(today), due);
  if (diff < 0) return "overdue";
  if (diff === 0) return "due_today";
  return "due";
}

/** Short badge text, e.g. "Overdue · 5 days", "Due in 3 days", "Paid". */
export function invoicePaymentLabel(inv: InvoiceLike, today: Date = new Date()): string {
  const state = invoicePaymentState(inv, today);
  const due = inv.due_date?.slice(0, 10);
  switch (state) {
    case "credit_note":
      return "Credit note";
    case "cancelled":
      return "Cancelled";
    case "paid":
      return "Paid";
    case "due_today":
      return "Due today";
    case "issued":
      return "Awaiting payment";
    case "overdue": {
      const n = daysBetween(due!, localDay(today));
      return `Overdue · ${n} day${n === 1 ? "" : "s"}`;
    }
    case "due": {
      const n = daysBetween(localDay(today), due!);
      return n === 1 ? "Due tomorrow" : `Due in ${n} days`;
    }
  }
}

/** True while the client still owes money on it. */
export function isUnpaid(state: InvoicePaymentState): boolean {
  return state === "overdue" || state === "due_today" || state === "due" || state === "issued";
}

export interface InvoiceBalance {
  outstanding: number;
  outstandingCount: number;
  overdue: number;
  overdueCount: number;
  /** Earliest due date among unpaid, not-yet-overdue invoices. */
  nextDue: string | null;
}

/**
 * What the client owes. Credit notes and cancelled invoices are excluded:
 * a credit note exists only to cancel its invoice, and that invoice is
 * already marked cancelled, so counting either would double-count.
 */
export function invoiceBalance(invoices: InvoiceLike[], today: Date = new Date()): InvoiceBalance {
  const out: InvoiceBalance = { outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, nextDue: null };
  for (const inv of invoices) {
    const state = invoicePaymentState(inv, today);
    if (!isUnpaid(state)) continue;
    const amount = typeof inv.total === "number" ? inv.total : 0;
    out.outstanding += amount;
    out.outstandingCount += 1;
    if (state === "overdue") {
      out.overdue += amount;
      out.overdueCount += 1;
    } else if (inv.due_date) {
      const d = inv.due_date.slice(0, 10);
      if (!out.nextDue || d < out.nextDue) out.nextDue = d;
    }
  }
  out.outstanding = Math.round(out.outstanding * 100) / 100;
  out.overdue = Math.round(out.overdue * 100) / 100;
  return out;
}
