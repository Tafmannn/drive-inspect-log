/**
 * Read the invoices and expenses the accounts reports are built from.
 * Org-scoped by RLS, like every other export.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptRef } from "@/features/invoicing/lib/invoiceMath";
import { INVOICE_LIST_COLUMNS, type InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";
import type { AccountExpense, AccountInvoice, Period } from "../lib/accountsReports";

export interface AccountsData {
  /** Every invoice and credit note (all dates): needed for aged debt and the VAT threshold. */
  invoices: AccountInvoice[];
  /** The raw rows behind `invoices`, for rendering PDFs into the pack. */
  invoiceRecords: InvoiceRecord[];
  /** Expenses dated inside the period. */
  expenses: AccountExpense[];
  /** Receipt files per expense id, for the pack's Receipts folder. */
  receipts: Map<string, ReceiptRef[]>;
}

const MAX_ROWS = 5000;

function toAccountInvoice(r: InvoiceRecord, numbersById: Map<string, string>): AccountInvoice {
  return {
    id: r.id,
    invoice_number: r.invoice_number,
    document_type: r.document_type ?? "invoice",
    status: r.status,
    issue_date: (r.issue_date || r.created_at).slice(0, 10),
    due_date: r.due_date,
    sent_at: r.sent_at ?? null,
    paid_at: r.paid_at ?? null,
    payment_method: r.payment_method ?? null,
    payment_reference: r.payment_reference ?? null,
    client_id: r.client_id ?? null,
    client_name: r.client_name,
    client_company: r.client_company,
    client_email: r.client_email,
    client_address: r.client_address,
    client_ref: r.client_ref ?? null,
    subtotal: Number(r.subtotal ?? 0),
    expenses_total: Number(r.expenses_total ?? 0),
    vat_rate: r.vat_rate == null ? null : Number(r.vat_rate),
    vat_amount: r.vat_amount == null ? null : Number(r.vat_amount),
    total: Number(r.total ?? 0),
    vat_registered: r.vat_registered ?? null,
    line_items: r.line_items,
    cancel_reason: r.cancel_reason ?? null,
    credits_invoice_number: r.credits_invoice_id ? numbersById.get(r.credits_invoice_id) ?? null : null,
  };
}

interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  supplier: string | null;
  label: string | null;
  notes: string | null;
  amount: number;
  vat_amount: number | null;
  jobs: { external_job_number: string | null; vehicle_reg: string | null; driver_name: string | null } | null;
  expense_receipts: { url: string; backend: string | null; backend_ref: string | null; created_at: string }[] | null;
  invoice_expenses: { voided: boolean; amount_charged: number; invoices: { invoice_number: string } | null }[] | null;
}

export async function fetchAccountsData(period: Pick<Period, "from" | "to">): Promise<AccountsData> {
  const [invoiceResult, expenseResult] = await Promise.all([
    supabase.from("invoices").select(INVOICE_LIST_COLUMNS).order("issue_date", { ascending: true }).limit(MAX_ROWS),
    supabase
      .from("expenses")
      .select(
        "id, date, category, supplier, label, notes, amount, vat_amount, " +
          "jobs(external_job_number, vehicle_reg, driver_name), " +
          "expense_receipts(url, backend, backend_ref, created_at), " +
          "invoice_expenses(voided, amount_charged, invoices(invoice_number))",
      )
      .eq("is_hidden", false)
      .gte("date", period.from)
      .lte("date", period.to)
      .order("date", { ascending: true })
      .limit(MAX_ROWS),
  ]);
  if (invoiceResult.error) throw new Error(`Could not load invoices: ${invoiceResult.error.message}`);
  if (expenseResult.error) throw new Error(`Could not load expenses: ${expenseResult.error.message}`);

  const invoiceRecords = (invoiceResult.data ?? []) as unknown as InvoiceRecord[];
  const numbersById = new Map(invoiceRecords.map((r) => [r.id, r.invoice_number]));

  const receipts = new Map<string, ReceiptRef[]>();
  const expenses = ((expenseResult.data ?? []) as unknown as ExpenseRow[]).map((e): AccountExpense => {
    const files = [...(e.expense_receipts ?? [])]
      .filter((r) => !!r.url)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    receipts.set(e.id, files.map((r) => ({ url: r.url, backend: r.backend, backend_ref: r.backend_ref })));
    // The live (non-cancelled) invoice this expense was recharged on, if any.
    const billed = (e.invoice_expenses ?? []).find((l) => !l.voided);
    return {
      id: e.id,
      date: e.date,
      category: e.category,
      supplier: e.supplier,
      label: e.label,
      notes: e.notes,
      amount: Number(e.amount),
      vat_amount: e.vat_amount == null ? null : Number(e.vat_amount),
      job_ref: e.jobs?.external_job_number ?? null,
      vehicle_reg: e.jobs?.vehicle_reg ?? null,
      driver_name: e.jobs?.driver_name ?? null,
      invoiced_on: billed?.invoices?.invoice_number ?? null,
      amount_recharged: billed ? Number(billed.amount_charged) : null,
      receipt_count: files.length,
    };
  });

  return {
    invoices: invoiceRecords.map((r) => toAccountInvoice(r, numbersById)),
    invoiceRecords,
    expenses,
    receipts,
  };
}
