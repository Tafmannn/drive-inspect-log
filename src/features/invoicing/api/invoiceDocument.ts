/**
 * Assemble the complete invoice document for a stored invoice: page 1 from
 * the invoice row, plus the supplier's business details, the itemised
 * expense schedule (VAT-registered only) and the receipt copies — all read
 * from the snapshot taken when the invoice was created, so a re-download
 * always matches what was issued.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  generateInvoicePdf,
  type ExpenseScheduleRow,
  type InvoiceBusinessDetails,
  type InvoiceData,
  type ReceiptImage,
} from "@/lib/invoicePdf";
import { invoiceRecordToPdfData, type InvoiceRecord } from "../hooks/useInvoices";
import { fmtDmy, type ReceiptRef } from "../lib/invoiceMath";
import { loadReceiptImage } from "./receiptImages";

export interface OrgInvoiceSettings {
  vatRegistered: boolean;
  business: InvoiceBusinessDetails;
}

export async function fetchOrgInvoiceSettings(orgId: string): Promise<OrgInvoiceSettings> {
  const { data, error } = await supabase
    .from("organisations")
    .select("name, legal_name, branding_name, trading_address, registered_address, company_number, vat_number, vat_registered")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Could not load organisation settings: ${error.message}`);
  const vatRegistered = data?.vat_registered === true;
  return {
    vatRegistered,
    business: {
      name: data?.legal_name || data?.branding_name || data?.name || null,
      address: data?.trading_address || data?.registered_address || null,
      companyNumber: data?.company_number || null,
      // A VAT number is only printed while the business is VAT registered.
      vatNumber: vatRegistered ? data?.vat_number || null : null,
    },
  };
}

export interface InvoiceExpenseLine {
  id: string;
  expense_id: string | null;
  job_id: string | null;
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

/** The expenses recharged on an invoice, in document order, with their receipt files. */
export async function fetchInvoiceExpenseLines(invoiceId: string): Promise<InvoiceExpenseLine[]> {
  const { data, error } = await supabase
    .from("invoice_expenses")
    .select("id, expense_id, job_id, ref, sort_order, expense_date, category, supplier, amount_gross, amount_vat, amount_charged")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Could not load invoice expenses: ${error.message}`);
  const lines = data ?? [];
  const expenseIds = lines.map((l) => l.expense_id).filter((id): id is string => !!id);

  const byExpense = new Map<string, ReceiptRef[]>();
  if (expenseIds.length) {
    const { data: receipts } = await supabase
      .from("expense_receipts")
      .select("expense_id, url, backend, backend_ref, created_at")
      .in("expense_id", expenseIds)
      .order("created_at", { ascending: true });
    for (const r of receipts ?? []) {
      if (!r.url) continue;
      const list = byExpense.get(r.expense_id) ?? [];
      list.push({ url: r.url, backend: r.backend, backend_ref: r.backend_ref });
      byExpense.set(r.expense_id, list);
    }
  }

  return lines.map((l) => ({
    ...l,
    amount_gross: Number(l.amount_gross),
    amount_vat: Number(l.amount_vat),
    amount_charged: Number(l.amount_charged),
    receipts: l.expense_id ? byExpense.get(l.expense_id) ?? [] : [],
  }));
}

interface JobMeta {
  ref: string;
  reg: string;
}

function jobMetaFromLineItems(raw: unknown): Map<string, JobMeta> {
  const map = new Map<string, JobMeta>();
  if (!Array.isArray(raw)) return map;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.job_id === "string") {
      map.set(it.job_id, {
        ref: typeof it.job_ref === "string" ? it.job_ref : "",
        reg: typeof it.vehicle_reg === "string" ? it.vehicle_reg : "",
      });
    }
  }
  return map;
}

/** A second (third ...) file for the same expense is labelled R01b, R01c ... */
export function receiptFileRef(ref: string, fileIndex: number): string {
  return fileIndex === 0 ? ref : `${ref}${String.fromCharCode(97 + Math.min(fileIndex, 25))}`;
}

export function receiptCaption(line: Pick<InvoiceExpenseLine, "category" | "expense_date" | "amount_gross">, jobRef: string): string {
  return [jobRef, line.category, fmtDmy(line.expense_date), `£${line.amount_gross.toFixed(2)}`]
    .filter(Boolean)
    .join("  |  ");
}

/**
 * Page-1 data + schedule + (optionally) receipt images for a stored invoice.
 * Credit notes carry no receipts or schedule.
 */
export async function buildInvoiceDocument(
  record: InvoiceRecord,
  opts: { settings?: OrgInvoiceSettings | null; withReceipts?: boolean } = {},
): Promise<InvoiceData> {
  const base = invoiceRecordToPdfData(record);
  const data: InvoiceData = { ...base, ...(opts.settings ? { business: opts.settings.business } : {}) };
  if (record.document_type === "credit_note") return data;

  const lines = await fetchInvoiceExpenseLines(record.id);
  if (!lines.length) return data;

  const jobs = jobMetaFromLineItems(record.line_items);
  const schedule: ExpenseScheduleRow[] = lines.map((l) => ({
    ref: l.ref,
    date: l.expense_date,
    jobRef: (l.job_id && jobs.get(l.job_id)?.ref) || "-",
    vehicleReg: (l.job_id && jobs.get(l.job_id)?.reg) || undefined,
    category: l.category,
    supplier: l.supplier ?? undefined,
    net: l.amount_charged,
    vat: l.amount_vat,
    gross: l.amount_gross,
  }));

  let receipts: ReceiptImage[] | undefined;
  if (opts.withReceipts !== false) {
    const jobs2 = jobs;
    const entries = lines.flatMap((l) => {
      const jobRefText = (l.job_id && jobs2.get(l.job_id)?.ref) || "";
      // An expense with no receipt file still gets a slot, so the gap is
      // visible to the client instead of the reference silently missing.
      const files: (ReceiptRef | null)[] = l.receipts.length ? l.receipts : [null];
      return files.map((file, i) => ({
        ref: receiptFileRef(l.ref, i),
        caption: receiptCaption(l, jobRefText),
        file,
      }));
    });
    // Sequential, not parallel: each image is decoded onto a canvas, and a
    // large batch decoded at once can exhaust memory on a phone.
    receipts = [];
    for (const e of entries) {
      receipts.push({
        ref: e.ref,
        caption: e.caption,
        image: e.file ? await loadReceiptImage(e.file) : null,
      });
    }
  }

  return {
    ...data,
    expenseSchedule: schedule,
    ...(receipts ? { receipts, receiptsPerPage: 6 as const } : {}),
  };
}

/** The full invoice PDF (page 1 + schedule + receipt copies) for a stored invoice. */
export async function generateInvoiceDocumentPdf(
  record: InvoiceRecord,
  settings?: OrgInvoiceSettings | null,
): Promise<Blob> {
  return generateInvoicePdf(await buildInvoiceDocument(record, { settings, withReceipts: true }));
}
