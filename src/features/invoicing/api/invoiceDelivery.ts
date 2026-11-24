import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePdf, invoicePdfFileName } from "@/lib/invoicePdf";
import type { InvoiceRecord } from "../hooks/useInvoices";
import { buildInvoiceDocument, fetchInvoiceExpenseLines, type OrgInvoiceSettings } from "./invoiceDocument";
import { buildInvoicePack } from "./receiptExport";

const BUCKET = "invoice-pdfs";

function clean(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** No clean invoice is issued until both customer delivery endpoints advertise support. */
async function requirePackDelivery() {
  const [portal, email] = await Promise.all([
    supabase.functions.invoke("portal-evidence", { body: { action: "invoice-pack-capability" } }),
    supabase.functions.invoke("send-invoice-email", { body: { action: "invoice-pack-capability" } }),
  ]);
  if (portal.error || email.error || portal.data?.invoicePackVersion !== 1 || email.data?.invoicePackVersion !== 1) {
    throw new Error("Invoice pack delivery is not enabled on this environment. Contact an administrator before issuing.");
  }
}

/** Build a single financial PDF and its exact ZIP before writing anything. */
export async function buildCompleteInvoiceDelivery(record: InvoiceRecord, settings?: OrgInvoiceSettings | null) {
  const lines = await fetchInvoiceExpenseLines(record.id);
  const data = await buildInvoiceDocument(record, { settings, withReceipts: false, expenseLines: lines });
  const pdf = await generateInvoicePdf(data);
  const pack = await buildInvoicePack(record, settings, undefined, { pdf, lines });
  if (pack.failed.length) throw new Error("Invoice pack incomplete: " + pack.failed.join(", "));
  const zip = await JSZip.loadAsync(pack.blob);
  // Use persisted invoice associations, not caller-supplied JSON job references.
  const { data: owner, error: ownerError } = await supabase.from("invoices")
    .select("id, org_id, client_id, job_id, status, pdf_url").eq("id", record.id).single();
  if (ownerError || !owner || owner.status !== "draft" || (record.org_id && owner.org_id !== record.org_id)) {
    throw new Error("Invoice is no longer an accessible draft.");
  }
  const { data: items, error: itemError } = await supabase.from("invoice_items")
    .select("job_id").eq("invoice_id", record.id).eq("voided", false);
  if (itemError) throw new Error("Could not verify the jobs on this invoice: " + itemError.message);
  const ids = [...new Set([owner.job_id, ...(items ?? []).map(i => i.job_id)].filter((id): id is string => !!id))];
  if (record.document_type !== "credit_note" && ids.length) {
    const { data: jobs, error } = await supabase.from("jobs")
      .select("id, org_id, client_id, status, external_job_number, vehicle_reg").in("id", ids);
    if (error || jobs?.length !== ids.length) throw new Error("Could not verify all invoice jobs.");
    const { getJobWithRelations } = await import("@/lib/api");
    const { generatePodPdf } = await import("@/lib/podPdf");
    for (const job of jobs ?? []) {
      if (job.org_id !== owner.org_id || (owner.client_id && job.client_id !== owner.client_id)) {
        throw new Error("Invoice job ownership mismatch.");
      }
      if (job.status === "aborted") continue; // no completed delivery for an abort
      if (job.status !== "completed" && job.status !== "closed") throw new Error("POD unavailable for " + (job.external_job_number || job.id));
      const full = await getJobWithRelations(job.id);
      if (full.status !== job.status || !full.inspections.some(i => i.type === "pickup") || !full.inspections.some(i => i.type === "delivery")) {
        throw new Error("Delivery evidence is incomplete for " + (job.external_job_number || job.id));
      }
      const pod = await generatePodPdf(full);
      if (!pod.size) throw new Error("POD could not be rendered for " + job.id);
      zip.file("PODs/POD_" + clean(job.vehicle_reg || "UNKNOWN") + "_" + clean(job.id) + ".pdf", pod);
    }
  }
  return { pdf, blob: await zip.generateAsync({ type: "blob" }), succeeded: pack.succeeded, failed: [], fileName: invoicePdfFileName(record.invoice_number).replace(/\.pdf$/, ".zip"), owner };
}

/** Freeze the pack before publishing its PDF path. Uploads never overwrite issued bytes. */
export async function prepareInvoiceDelivery(record: InvoiceRecord, orgId: string, settings?: OrgInvoiceSettings | null) {
  if (record.status !== "draft") throw new Error("Only a draft can be prepared.");
  await requirePackDelivery();
  const prepared = await buildCompleteInvoiceDelivery(record, settings);
  if (prepared.owner.org_id !== orgId) throw new Error("Invoice organisation mismatch.");
  const pdfPath = `${orgId}/pack-v1-${record.id}/${crypto.randomUUID()}/${invoicePdfFileName(record.invoice_number)}`;
  const zipPath = pdfPath.replace(/\.pdf$/, ".zip");
  const bucket = supabase.storage.from(BUCKET);
  const zipUpload = await bucket.upload(zipPath, prepared.blob, { contentType: "application/zip", upsert: false });
  if (zipUpload.error) throw new Error("Could not store invoice pack: " + zipUpload.error.message);
  const pdfUpload = await bucket.upload(pdfPath, prepared.pdf, { contentType: "application/pdf", upsert: false });
  if (pdfUpload.error) throw new Error("Could not store invoice PDF: " + pdfUpload.error.message);
  let update = supabase.from("invoices").update({ pdf_url: pdfPath }).eq("id", record.id).eq("status", "draft");
  update = prepared.owner.pdf_url ? update.eq("pdf_url", prepared.owner.pdf_url) : update.is("pdf_url", null);
  const { data, error } = await update.select("id");
  if (error || data?.length !== 1) throw new Error("Invoice changed during preparation. Refresh and retry.");
  return pdfPath;
}

export async function markPreparedInvoiceSent(record: InvoiceRecord, orgId: string, settings?: OrgInvoiceSettings | null) {
  const path = await prepareInvoiceDelivery(record, orgId, settings);
  const { data, error } = await supabase.from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", record.id).eq("status", "draft").eq("pdf_url", path).select("id");
  if (error || data?.length !== 1) throw new Error("Invoice changed before issue. Refresh and retry.");
}
