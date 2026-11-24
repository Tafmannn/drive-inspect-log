/**
 * Invoice pack export: the invoice PDF plus the original receipt files for
 * exactly the expenses recharged on that invoice — never every receipt on
 * the job. Files are named after their receipt reference so they line up
 * with the invoice rows and any historical receipt pages:
 *
 *   receipts/R01_AX1042_Fuel_54.60.jpg
 *
 * Handles: no expenses, an expense with no receipt file, files that fail to
 * download (reported back, never silently dropped).
 */
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePdf, invoicePdfFileName } from "@/lib/invoicePdf";
import type { InvoiceRecord } from "../hooks/useInvoices";
import {
  buildInvoiceDocument,
  fetchInvoiceExpenseLines,
  receiptFileRef,
  type InvoiceExpenseLine,
  type OrgInvoiceSettings,
} from "./invoiceDocument";
import { getInvoicePdf, INVOICE_PDF_BUCKET } from "./invoiceLifecycle";
import { fetchReceiptBlob } from "./receiptImages";
import { issuedPackPath } from "./invoicePackPath";

export interface InvoicePackResult {
  blob: Blob;
  fileName: string;
  /** Receipt files written into the ZIP. */
  succeeded: number;
  /** Human-readable reasons for each receipt that is missing from the ZIP. */
  failed: string[];
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

export function guessExtension(url: string, mime?: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("webp")) return ".webp";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  const lower = (url || "").toLowerCase().split("?")[0];
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".pdf")) return ".pdf";
  if (lower.endsWith(".webp")) return ".webp";
  return ".jpg";
}

/** "R01_AX1042_Fuel_54.60" — matches the receipt ref on the invoice. */
export function receiptFileStem(
  line: Pick<InvoiceExpenseLine, "ref" | "category" | "amount_gross">,
  jobRef: string,
  fileIndex: number,
): string {
  return [receiptFileRef(line.ref, fileIndex), safePart(jobRef), safePart(line.category), line.amount_gross.toFixed(2)]
    .filter(Boolean)
    .join("_");
}

function jobRefsFromLineItems(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(raw)) return map;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.job_id === "string" && typeof it.job_ref === "string") map.set(it.job_id, it.job_ref);
  }
  return map;
}

/** ZIP of the invoice PDF + a receipts/ folder for the expenses on that invoice. */
export async function buildInvoicePack(
  record: InvoiceRecord,
  settings?: OrgInvoiceSettings | null,
  onProgress?: (done: number, total: number) => void,
  prepared?: { pdf: Blob; lines: InvoiceExpenseLine[] },
): Promise<InvoicePackResult> {
  const frozenPath = record.status !== "draft" ? issuedPackPath(record.pdf_url, record.id) : null;
  if (frozenPath) {
    const { data, error } = await supabase.storage.from(INVOICE_PDF_BUCKET).download(frozenPath);
    if (error || !data?.size) throw new Error("Could not download the original issued invoice pack. Please retry.");
    const archive = await JSZip.loadAsync(data);
    const succeeded = Object.values(archive.files).filter(f => !f.dir && f.name.startsWith("receipts/")).length;
    return { blob: data, fileName: invoicePdfFileName(record.invoice_number).replace(/\.pdf$/, ".zip"), succeeded, failed: [] };
  }
  const zip = new JSZip();

  const lines = prepared?.lines ?? await fetchInvoiceExpenseLines(record.id);
  const jobRefs = jobRefsFromLineItems(record.line_items);
  const failed: string[] = [];
  let succeeded = 0;
  let done = 0;
  const total = lines.reduce((n, l) => n + Math.max(1, l.receipts.length), 0);
  // Do not create an empty folder or duplicate the same underlying file for one expense.
  const seen = new Set<string>();

  for (const line of lines) {
    const jobRef = (line.job_id && jobRefs.get(line.job_id)) || "";
    if (line.receipts.length === 0) {
      failed.push(`${line.ref} (no receipt on file)`);
      onProgress?.(++done, total);
      continue;
    }
    for (let i = 0; i < line.receipts.length; i++) {
      const file = line.receipts[i];
      const identity = JSON.stringify([line.id, file.backend ?? '', file.backend_ref || file.url]);
      if (seen.has(identity)) {
        onProgress?.(++done, total);
        continue;
      }
      const blob = await fetchReceiptBlob(file);
      if (blob && blob.size > 0) {
        zip.file("receipts/" + receiptFileStem(line, jobRef, i) + guessExtension(file.url, blob.type), blob);
        seen.add(identity);
        succeeded++;
      } else {
        failed.push(`${receiptFileRef(line.ref, i)} (download failed)`);
      }
      onProgress?.(++done, total);
    }
  }

  // A complete draft pack has its evidence alongside the invoice, not embedded.
  // Standalone delivery and incomplete packs keep the existing document path.
  // Never substitute a new render for a previously issued PDF in a pack.
  let pdf: Blob;
  if (prepared) {
    pdf = prepared.pdf;
  } else if (record.status === "draft" && failed.length === 0) {
    pdf = await generateInvoicePdf(await buildInvoiceDocument(record, { settings, withReceipts: false, expenseLines: lines }));
  } else if (record.status !== "draft" && record.pdf_url) {
    const { data, error } = await supabase.storage.from(INVOICE_PDF_BUCKET).download(record.pdf_url);
    if (error || !data || data.size === 0) throw new Error("Could not download the original issued invoice PDF. Please retry.");
    pdf = data;
  } else {
    pdf = await getInvoicePdf(record, settings);
  }
  zip.file(invoicePdfFileName(record.invoice_number), pdf);
  const blob = await zip.generateAsync({ type: "blob" });
  const safeNumber = record.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
  return { blob, fileName: `invoice_pack_${safeNumber}.zip`, succeeded, failed };
}

/** Trigger a browser download for a blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
