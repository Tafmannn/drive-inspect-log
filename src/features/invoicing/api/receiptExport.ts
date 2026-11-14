/**
 * Invoice pack export: the invoice PDF plus the original receipt files for
 * exactly the expenses recharged on that invoice — never every receipt on
 * the job. Files are named after their receipt reference so they line up
 * with the invoice rows and the receipt pages:
 *
 *   receipts/R01_AX1042_Fuel_54.60.jpg
 *
 * Handles: no expenses, an expense with no receipt file, files that fail to
 * download (reported back, never silently dropped).
 */
import JSZip from "jszip";
import { invoicePdfFileName } from "@/lib/invoicePdf";
import type { InvoiceRecord } from "../hooks/useInvoices";
import {
  fetchInvoiceExpenseLines,
  receiptFileRef,
  type InvoiceExpenseLine,
  type OrgInvoiceSettings,
} from "./invoiceDocument";
import { getInvoicePdf } from "./invoiceLifecycle";
import { fetchReceiptBlob } from "./receiptImages";

export interface InvoicePackResult {
  blob: Blob;
  fileName: string;
  /** Receipt files written into the ZIP. */
  succeeded: number;
  /** Human-readable reasons for each receipt that is missing from the ZIP. */
  failed: string[];
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
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
): Promise<InvoicePackResult> {
  const zip = new JSZip();
  zip.file(invoicePdfFileName(record.invoice_number), await getInvoicePdf(record, settings));

  const lines = await fetchInvoiceExpenseLines(record.id);
  const jobRefs = jobRefsFromLineItems(record.line_items);
  const failed: string[] = [];
  let succeeded = 0;
  let done = 0;
  const total = lines.reduce((n, l) => n + Math.max(1, l.receipts.length), 0);
  const folder = lines.length ? zip.folder("receipts") : null;

  for (const line of lines) {
    const jobRef = (line.job_id && jobRefs.get(line.job_id)) || "";
    if (line.receipts.length === 0) {
      failed.push(`${line.ref} (no receipt on file)`);
      onProgress?.(++done, total);
      continue;
    }
    for (let i = 0; i < line.receipts.length; i++) {
      const file = line.receipts[i];
      const blob = await fetchReceiptBlob(file);
      if (blob && folder) {
        folder.file(receiptFileStem(line, jobRef, i) + guessExtension(file.url, blob.type), blob);
        succeeded++;
      } else {
        failed.push(`${receiptFileRef(line.ref, i)} (download failed)`);
      }
      onProgress?.(++done, total);
    }
  }

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
