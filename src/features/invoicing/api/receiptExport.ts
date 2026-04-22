/**
 * Receipt export utilities for multi-job invoices.
 *
 * Discovery logic:
 *   1. For each job ID, query `expense_receipts` (via expenses) for receipt URLs
 *   2. For each job ID, query `photos` where type = 'receipt' as a fallback
 *   3. Resolve each URL through the GCS proxy for authenticated download
 *   4. Bundle into a ZIP with filenames prefixed by job ref
 *
 * Handles: zero receipts, missing files, mixed storage backends.
 */

import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { resolveMediaUrlAsync } from "@/lib/mediaResolver";
import type { EligibleJob } from "../hooks/useInvoicePrepData";

export interface ReceiptFile {
  jobId: string;
  jobRef: string;
  fileName: string;
  sourceUrl: string;
  source: "expense_receipt" | "photo";
}

export interface ReceiptDiscoveryResult {
  files: ReceiptFile[];
  totalCount: number;
  jobsWithReceipts: number;
  jobsMissing: number;
}

/** Discover all receipt files for a set of jobs */
export async function discoverReceipts(
  jobs: EligibleJob[]
): Promise<ReceiptDiscoveryResult> {
  if (!jobs.length) {
    return { files: [], totalCount: 0, jobsWithReceipts: 0, jobsMissing: 0 };
  }

  const jobIds = jobs.map((j) => j.id);
  const jobRefMap = new Map<string, string>();
  jobs.forEach((j) => {
    jobRefMap.set(j.id, j.external_job_number || j.id.slice(0, 8));
  });

  const files: ReceiptFile[] = [];

  // 1. Expense receipts: expenses → expense_receipts
  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, job_id")
    .in("job_id", jobIds)
    .eq("is_hidden", false);

  if (expenses && expenses.length > 0) {
    const expenseIds = expenses.map((e) => e.id);
    const { data: receipts } = await supabase
      .from("expense_receipts")
      .select("id, expense_id, url")
      .in("expense_id", expenseIds);

    if (receipts) {
      // Map expense_id → job_id
      const expToJob = new Map<string, string>();
      expenses.forEach((e) => {
        expToJob.set(e.id, e.job_id);
      });

      receipts.forEach((r, idx) => {
        const jobId = expToJob.get(r.expense_id);
        if (!jobId || !r.url) return;
        const jobRef = jobRefMap.get(jobId) || jobId.slice(0, 8);
        const ext = guessExtension(r.url);
        files.push({
          jobId,
          jobRef,
          fileName: jobRef + "_receipt_" + String(idx + 1) + ext,
          sourceUrl: r.url,
          source: "expense_receipt",
        });
      });
    }
  }

  // 2. Direct photo receipts on jobs — active only (exclude archived runs)
  const { data: photos } = await (supabase
    .from("photos")
    .select("id, job_id, url, label")
    .in("job_id", jobIds)
    .eq("type", "receipt") as any)
    .is("archived_at", null);

  if (photos) {
    photos.forEach((p, idx) => {
      if (!p.url) return;
      const jobRef = jobRefMap.get(p.job_id) || p.job_id.slice(0, 8);
      const ext = guessExtension(p.url);
      files.push({
        jobId: p.job_id,
        jobRef,
        fileName: jobRef + "_photo_receipt_" + String(idx + 1) + ext,
        sourceUrl: p.url,
        source: "photo",
      });
    });
  }

  // Compute stats
  const jobsWithFiles = new Set(files.map((f) => f.jobId));
  return {
    files,
    totalCount: files.length,
    jobsWithReceipts: jobsWithFiles.size,
    jobsMissing: jobs.length - jobsWithFiles.size,
  };
}

/** Download all receipts and bundle into a ZIP blob */
export async function buildReceiptsZip(
  files: ReceiptFile[],
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; succeeded: number; failed: string[] }> {
  const zip = new JSZip();
  const failed: string[] = [];
  let succeeded = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const resolvedUrl = await resolveMediaUrlAsync(f.sourceUrl);
      if (!resolvedUrl) {
        failed.push(f.fileName + " (URL resolution failed)");
        continue;
      }

      const resp = await fetch(resolvedUrl);
      if (!resp.ok) {
        failed.push(f.fileName + " (HTTP " + resp.status + ")");
        continue;
      }

      const data = await resp.arrayBuffer();
      zip.file(f.fileName, data);
      succeeded++;
    } catch (err: any) {
      failed.push(f.fileName + " (" + (err.message || "fetch error") + ")");
    }
    onProgress?.(i + 1, files.length);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, succeeded, failed };
}

/** Build a full invoice pack: PDF blob + receipts ZIP */
export async function buildInvoicePack(
  pdfBlob: Blob,
  invoiceNumber: string,
  receiptFiles: ReceiptFile[],
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; succeeded: number; failed: string[] }> {
  const zip = new JSZip();
  const failed: string[] = [];
  let succeeded = 0;

  // Add PDF
  const safeName = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  zip.file("AXENTRA_INV_" + safeName + ".pdf", pdfBlob);

  // Add receipts in a subfolder
  const receiptsFolder = zip.folder("receipts");
  if (receiptsFolder && receiptFiles.length > 0) {
    for (let i = 0; i < receiptFiles.length; i++) {
      const f = receiptFiles[i];
      try {
        const resolvedUrl = await resolveMediaUrlAsync(f.sourceUrl);
        if (!resolvedUrl) {
          failed.push(f.fileName + " (URL resolution failed)");
          continue;
        }

        const resp = await fetch(resolvedUrl);
        if (!resp.ok) {
          failed.push(f.fileName + " (HTTP " + resp.status + ")");
          continue;
        }

        const data = await resp.arrayBuffer();
        receiptsFolder.file(f.fileName, data);
        succeeded++;
      } catch (err: any) {
        failed.push(f.fileName + " (" + (err.message || "fetch error") + ")");
      }
      onProgress?.(i + 1, receiptFiles.length);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, succeeded, failed };
}

function guessExtension(url: string): string {
  const lower = (url || "").toLowerCase();
  if (lower.includes(".png")) return ".png";
  if (lower.includes(".pdf")) return ".pdf";
  if (lower.includes(".webp")) return ".webp";
  return ".jpg";
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
