/**
 * Invoice lifecycle actions: issue (mark as sent), record payment, cancel.
 *
 * The database enforces the rules (20261114130000_invoice_lifecycle.sql):
 * once an invoice leaves 'draft' its contents are frozen and it cannot be
 * deleted; only these lifecycle fields may change. The PDF is stored at the
 * moment of issue, so every later download or email is the identical file
 * the client received — even if the template changes afterwards.
 */
import { supabase } from "@/integrations/supabase/client";
import { invoicePdfFileName } from "@/lib/invoicePdf";
import type { InvoiceRecord } from "../hooks/useInvoices";
import { generateInvoiceDocumentPdf, type OrgInvoiceSettings } from "./invoiceDocument";

export const INVOICE_PDF_BUCKET = "invoice-pdfs";

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export function invoicePdfPath(orgId: string, invoiceNumber: string): string {
  return `${orgId}/${invoicePdfFileName(invoiceNumber)}`;
}

/** Upload (or replace) the invoice PDF in the private org-scoped bucket. Returns its path. */
export async function storeInvoicePdf(orgId: string, invoiceNumber: string, blob: Blob): Promise<string> {
  const path = invoicePdfPath(orgId, invoiceNumber);
  const { error } = await supabase.storage
    .from(INVOICE_PDF_BUCKET)
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Could not store the invoice PDF: ${error.message}`);
  return path;
}

/**
 * The invoice PDF: the stored copy if the invoice has been issued, otherwise
 * a fresh render of the draft.
 */
export async function getInvoicePdf(
  record: InvoiceRecord,
  settings?: OrgInvoiceSettings | null,
): Promise<Blob> {
  if (record.pdf_url && record.status !== "draft") {
    const { data, error } = await supabase.storage.from(INVOICE_PDF_BUCKET).download(record.pdf_url);
    if (!error && data) return data;
    // Stored copy unreadable: fall back to re-rendering from the snapshot.
  }
  return generateInvoiceDocumentPdf(record, settings);
}

/**
 * Render and store the PDF for an invoice that is about to be issued, and
 * record its path. Always re-rendered: a draft may have an older copy in
 * storage (from an email attempt that failed), and business details may
 * have been completed since.
 */
export async function freezeInvoicePdf(
  record: InvoiceRecord,
  orgId: string,
  settings?: OrgInvoiceSettings | null,
): Promise<string> {
  const blob = await generateInvoiceDocumentPdf(record, settings);
  const path = await storeInvoicePdf(orgId, record.invoice_number, blob);
  const { error } = await supabase.from("invoices").update({ pdf_url: path }).eq("id", record.id);
  if (error) throw new Error(`Could not record the stored invoice PDF: ${error.message}`);
  return path;
}

/** Issue a draft that was delivered outside the app (downloaded and sent by hand). */
export async function markInvoiceSent(
  record: InvoiceRecord,
  orgId: string,
  settings?: OrgInvoiceSettings | null,
): Promise<void> {
  if (record.status !== "draft") throw new Error("Only a draft invoice can be marked as sent.");
  await freezeInvoicePdf(record, orgId, settings);
  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", record.id)
    .eq("status", "draft");
  if (error) throw new Error(`Could not mark the invoice as sent: ${error.message}`);
}

export interface PaymentInput {
  /** yyyy-mm-dd */
  paidAt: string;
  method: string;
  reference?: string;
}

export async function markInvoicePaid(invoiceId: string, payment: PaymentInput): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.paidAt)) throw new Error("Enter the date the payment was received.");
  const { data, error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: payment.paidAt,
      payment_method: payment.method,
      payment_reference: payment.reference?.trim() || null,
    })
    .eq("id", invoiceId)
    .eq("status", "sent")
    .select("id");
  if (error) throw new Error(`Could not record the payment: ${error.message}`);
  if (!data?.length) throw new Error("Only a sent invoice can be marked as paid.");
}

/** Undo a payment recorded by mistake. */
export async function markInvoiceUnpaid(invoiceId: string): Promise<void> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "sent", paid_at: null, payment_method: null, payment_reference: null })
    .eq("id", invoiceId)
    .eq("status", "paid")
    .select("id");
  if (error) throw new Error(`Could not undo the payment: ${error.message}`);
  if (!data?.length) throw new Error("This invoice is not marked as paid.");
}

/**
 * Cancel an invoice. A draft is simply cancelled; an issued invoice is
 * cancelled by a credit note for the full amount. Either way its jobs and
 * expenses become available to invoice again.
 * Returns the credit note's id, or null when none was raised.
 */
export async function cancelInvoice(invoiceId: string, reason: string): Promise<string | null> {
  if (!reason.trim()) throw new Error("Enter a reason for cancelling this invoice.");
  const { data, error } = await supabase.rpc("cancel_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
