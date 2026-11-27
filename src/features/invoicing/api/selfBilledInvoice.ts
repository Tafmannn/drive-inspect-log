/**
 * Record a self-billing client's own paid invoice (e.g. Movex raises it through their app
 * and pays it). Their PDF is stored first, then record_self_billed_invoice writes the
 * invoice, its job lines and the paid status in one transaction; if that is refused the
 * uploaded file is removed again.
 */
import { supabase } from "@/integrations/supabase/client";

export const SELF_BILL_PDF_MAX_BYTES = 15 * 1024 * 1024;

export interface SelfBillLine {
  jobId: string;
  /** What the client paid for this job (£, >0). */
  amount: number;
}

export interface SelfBillInput {
  orgId: string;
  clientId: string;
  invoiceNumber: string;
  /** yyyy-mm-dd */
  issueDate: string;
  /** yyyy-mm-dd */
  paidAt: string;
  lines: SelfBillLine[];
  pdf: File | null;
  paymentReference?: string;
  notes?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure: everything wrong with the form, in plain words (empty = OK to save). */
export function validateSelfBill(input: Omit<SelfBillInput, "orgId">, today: string): string[] {
  const errors: string[] = [];
  if (!input.invoiceNumber.trim()) errors.push("Enter their invoice number.");
  if (!ISO_DATE.test(input.issueDate)) errors.push("Enter the date on their invoice.");
  else if (input.issueDate > today) errors.push("Their invoice date can't be in the future.");
  if (!ISO_DATE.test(input.paidAt)) errors.push("Enter the date you were paid.");
  else if (input.paidAt > today) errors.push("The paid date can't be in the future.");
  if (input.lines.length === 0) errors.push("Tick the jobs on their invoice.");
  if (input.lines.some((l) => !(Number.isFinite(l.amount) && l.amount > 0))) {
    errors.push("Every job needs the amount they paid, above £0.");
  }
  if (!input.pdf) errors.push("Attach their invoice PDF.");
  else {
    const isPdf = input.pdf.type === "application/pdf" || /\.pdf$/i.test(input.pdf.name);
    if (!isPdf) errors.push("Their invoice must be a PDF.");
    if (input.pdf.size > SELF_BILL_PDF_MAX_BYTES) errors.push("Their PDF is over 15 MB.");
  }
  return errors;
}

/** Pure: a database refusal as something an admin can act on. */
export function selfBillErrorMessage(raw: string): string {
  const m = raw || "";
  if (/SELF_BILL_NUMBER_IN_USE/.test(m)) return "That invoice number is already recorded. Check it isn't a duplicate.";
  if (/JOB_ALREADY_INVOICED/.test(m)) {
    const ref = /JOB_ALREADY_INVOICED: (\S+)/.exec(m)?.[1];
    return `${ref ?? "A ticked job"} is already on an invoice. Untick it and try again.`;
  }
  if (/CLIENT_NOT_SELF_BILLING/.test(m)) return "This client is set to be invoiced by you. Change their Invoicing setting first.";
  if (/SELF_BILL_JOB_NOT_THIS_CLIENT/.test(m)) return "A ticked job belongs to a different client.";
  if (/SELF_BILL_JOB_NOT_BILLABLE/.test(m)) return "A ticked job isn't finished yet.";
  if (/ABORT_NOT_APPROVED|ABORT_AMOUNT_EXCEEDED/.test(m)) return "An aborted job's fee isn't approved, or the amount is above the approved Abort fee.";
  if (/SELF_BILL_VAT_NOT_SUPPORTED/.test(m)) return "Recording self-billed invoices isn't available while you're VAT registered yet.";
  if (/ADMIN_REQUIRED|CLIENT_NOT_FOUND/.test(m)) return "You don't have permission to record invoices for this client.";
  if (/record_self_billed_invoice|does not exist|PGRST202/.test(m)) {
    return "Recording self-billed invoices isn't switched on in the database yet. Ask for the database update to be released.";
  }
  return m || "Could not record their invoice.";
}

function safeFileName(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "invoice";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export async function recordSelfBilledInvoice(input: SelfBillInput): Promise<string> {
  const pdf = input.pdf;
  if (!pdf) throw new Error("Attach their invoice PDF.");
  const path = `${input.orgId}/self-billed/${crypto.randomUUID()}/${safeFileName(pdf.name)}`;
  const bucket = supabase.storage.from("invoice-pdfs");
  const upload = await bucket.upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw new Error(`Could not store their PDF: ${upload.error.message}`);

  const { data, error } = await supabase.rpc("record_self_billed_invoice" as never, {
    p_client_id: input.clientId,
    p_invoice_number: input.invoiceNumber.trim(),
    p_issue_date: input.issueDate,
    p_paid_at: input.paidAt,
    p_lines: input.lines.map((l) => ({ job_id: l.jobId, amount: Math.round(l.amount * 100) / 100 })),
    p_pdf_path: path,
    p_payment_reference: input.paymentReference?.trim() || null,
    p_notes: input.notes?.trim() || null,
  } as never);
  if (error || !data) {
    await bucket.remove([path]).catch(() => undefined);
    throw new Error(selfBillErrorMessage(error?.message ?? ""));
  }
  return data as unknown as string;
}
