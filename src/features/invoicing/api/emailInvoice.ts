/**
 * emailInvoice — generate the invoice PDF, store it in the private
 * org-scoped `invoice-pdfs` bucket, and send the client a branded email
 * with a 30-day signed download link via the send-invoice-email edge
 * function. Mirrors the POD email pipeline (podPdf.ts emailPodPdf), but
 * with no share/mailto fallback: invoicing is an admin-only surface with
 * a confirm dialog in front of it, so a failure is surfaced as an error
 * for the admin to retry rather than silently degrading.
 */
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePdf, type InvoiceData } from "@/lib/invoicePdf";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, matching the email copy

export interface EmailInvoiceInput {
  invoiceId: string;
  invoiceNumber: string;
  orgId: string;
  pdfData: InvoiceData;
  to: string;
}

export async function emailInvoice({
  invoiceId,
  invoiceNumber,
  orgId,
  pdfData,
  to,
}: EmailInvoiceInput): Promise<{ recipient: string }> {
  const blob = await generateInvoicePdf(pdfData);

  const sanitizedNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${orgId}/AXENTRA_INV_${sanitizedNumber}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("invoice-pdfs")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    throw new Error(`Could not store the invoice PDF: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("invoice-pdfs")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    throw new Error("Could not create the invoice download link");
  }

  const { data, error } = await supabase.functions.invoke("send-invoice-email", {
    body: { to, invoiceId, downloadUrl: signed.signedUrl },
  });
  if (error || !data?.sent) {
    throw new Error(
      error?.message || (data as { error?: string } | null)?.error || "Email failed to send"
    );
  }

  return { recipient: to };
}
