/**
 * Read-back of created invoices, and reconstruction of a downloadable PDF
 * from a stored row. Until this existed, invoices were write-only: both
 * creation flows inserted rows but no screen ever listed them, so there was
 * no way to download an invoice after the moment it was created.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData, InvoiceLineItem } from "@/lib/invoicePdf";

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
}

export function useInvoices(limit = 25) {
  return useQuery({
    // Under the ["invoicing"] prefix so the invoice_created mutation event
    // (mutationEvents.ts) refreshes this list automatically.
    queryKey: ["invoicing", "list", limit],
    queryFn: async (): Promise<InvoiceRecord[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, client_name, client_company, client_email, client_address, issue_date, due_date, payment_terms, line_items, subtotal, vat_rate, vat_amount, total, notes, status, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRecord[];
    },
  });
}

/**
 * Normalise stored line_items to the PDF generator's shape. The two write
 * paths stored different JSON: the multi-job prep flow writes
 * {description, amount, quantity, sort_order}; the legacy single-job
 * generator writes {description, quantity, unitPrice}.
 */
function normaliseLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items = raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, i) => ({
      description: typeof item.description === "string" ? item.description : "Line item",
      quantity: Number(item.quantity ?? 1) || 1,
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.amount ?? 0) || 0,
      sortOrder: Number(item.sort_order ?? i),
    }));
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  return items.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice }));
}

/** Rebuild the PDF input from a stored invoice row. */
export function invoiceRecordToPdfData(inv: InvoiceRecord): InvoiceData {
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
  };
}
