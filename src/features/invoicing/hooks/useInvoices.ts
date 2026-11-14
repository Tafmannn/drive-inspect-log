/**
 * Read-back of created invoices, and reconstruction of a downloadable PDF
 * from a stored row. Until this existed, invoices were write-only: both
 * creation flows inserted rows but no screen ever listed them, so there was
 * no way to download an invoice after the moment it was created.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData, InvoiceLineItem } from "@/lib/invoicePdf";
import { jobsHeaderSubtitle } from "../lib/invoiceMath";

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  client_address: string | null;
  issue_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  line_items: unknown;
  subtotal: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  total: number | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  // Present on rows read by the operator's invoice list; absent from the
  // client-portal projection (which has its own SECURITY DEFINER reader).
  org_id?: string;
  client_id?: string | null;
  client_ref?: string | null;
  vat_registered?: boolean | null;
  expenses_total?: number | null;
  document_type?: string | null;
  credits_invoice_id?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  pdf_url?: string | null;
}

export const INVOICE_LIST_COLUMNS =
  "id, org_id, client_id, invoice_number, client_name, client_company, client_email, client_address, issue_date, due_date, payment_terms, line_items, subtotal, vat_rate, vat_amount, total, notes, status, created_at, client_ref, vat_registered, expenses_total, document_type, credits_invoice_id, sent_at, paid_at, payment_method, payment_reference, cancelled_at, cancel_reason, pdf_url";

export function useInvoices(limit = 25) {
  return useQuery({
    // Under the ["invoicing"] prefix so the invoice_created mutation event
    // (mutationEvents.ts) refreshes this list automatically.
    queryKey: ["invoicing", "list", limit],
    queryFn: async (): Promise<InvoiceRecord[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select(INVOICE_LIST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRecord[];
    },
  });
}

/**
 * Normalise stored line_items to the PDF generator's shape. The write
 * paths stored different JSON: the multi-job prep flow writes
 * {description, amount, quantity, sort_order} — plus, since rechargeable
 * expenses, {detail, expense_amount, job_ref, job_date}; the legacy
 * single-job generator writes {description, quantity, unitPrice}.
 */
function normaliseLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items = raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, i) => ({
      description: typeof item.description === "string" ? item.description : "Line item",
      quantity: Number(item.quantity ?? 1) || 1,
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.amount ?? 0) || 0,
      detail: typeof item.detail === "string" && item.detail ? item.detail : undefined,
      expenseAmount: Number(item.expense_amount ?? 0) || 0,
      sortOrder: Number(item.sort_order ?? i),
    }));
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  return items.map(({ description, quantity, unitPrice, detail, expenseAmount }) => ({
    description,
    quantity,
    unitPrice,
    ...(detail ? { detail } : {}),
    ...(expenseAmount ? { expenseAmount } : {}),
  }));
}

/** Job days + count from the multi-job line_items shape; null for legacy rows. */
function multiJobMeta(raw: unknown): { days: string[]; count: number } | null {
  if (!Array.isArray(raw)) return null;
  const jobs = raw.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && typeof (item as Record<string, unknown>).job_ref === "string",
  );
  if (!jobs.length) return null;
  return {
    count: jobs.length,
    days: jobs.map((j) => (typeof j.job_date === "string" ? j.job_date : "")).filter(Boolean),
  };
}

/**
 * Rebuild the PDF input from a stored invoice row. Pure and synchronous:
 * it yields page 1 exactly as issued. Receipt copies and the business
 * footer need extra reads — see buildInvoiceDocument().
 */
export function invoiceRecordToPdfData(inv: InvoiceRecord): InvoiceData {
  const meta = multiJobMeta(inv.line_items);
  return {
    invoiceNumber: inv.invoice_number,
    issueDate: inv.issue_date || inv.created_at,
    dueDate: inv.due_date || undefined,
    paymentTerms: inv.payment_terms || undefined,
    clientName: inv.client_name,
    clientCompany: inv.client_company || undefined,
    clientEmail: inv.client_email || undefined,
    clientAddress: inv.client_address || undefined,
    vatRate: inv.vat_rate ?? 0,
    lineItems: normaliseLineItems(inv.line_items),
    notes: inv.notes || undefined,
    ...(inv.client_ref ? { clientRef: inv.client_ref } : {}),
    // null = an invoice from before the VAT switch existed: keep its
    // original presentation (VAT line at whatever rate was stored).
    ...(typeof inv.vat_registered === "boolean" ? { vatRegistered: inv.vat_registered } : {}),
    ...(inv.document_type === "credit_note" ? { documentType: "credit_note" as const } : {}),
    ...(meta
      ? { compactFooter: true, headerSubtitle: jobsHeaderSubtitle(meta.days, meta.count) }
      : {}),
  };
}
