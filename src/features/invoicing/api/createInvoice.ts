/**
 * createInvoice – transactional multi-job invoice creation.
 *
 * Flow:
 *   1. Generate next invoice number
 *   2. Re-verify no selected jobs are already invoiced (duplicate guard)
 *   3. Insert invoice header
 *   4. Insert invoice_items (one per job)
 *   5. If any step fails → manual rollback (delete header + items)
 *
 * Supabase JS doesn't expose real DB transactions, so we use a
 * best-effort insert-then-rollback pattern. The duplicate guard
 * at step 2 is the primary safety net.
 */

import { supabase } from "@/integrations/supabase/client";
import type { EligibleJob } from "../hooks/useInvoicePrepData";
import type { Client } from "@/lib/clientApi";

export interface CreateInvoiceInput {
  client: Client;
  jobs: EligibleJob[];
  vatRate: number;
  orgId: string;
  notes?: string;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  jobCount: number;
}

/** Get the next sequential invoice number for the org */
async function getNextInvoiceNumber(orgId: string): Promise<string> {
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1);

  let next = 1001;
  const last = data?.[0]?.invoice_number;
  if (last) {
    const match = last.match(/(\d+)$/);
    if (match) next = parseInt(match[1]) + 1;
  }
  const year = new Date().getFullYear().toString().slice(-2);
  return `AX${year}-${String(next).padStart(4, "0")}`;
}

/** Check which job IDs are already linked to invoice_items */
async function findAlreadyInvoicedJobs(jobIds: string[]): Promise<Set<string>> {
  const { data } = await supabase
    .from("invoice_items")
    .select("job_id")
    .in("job_id", jobIds);
  return new Set((data ?? []).map((r: any) => r.job_id).filter(Boolean));
}

export async function createMultiJobInvoice(
  input: CreateInvoiceInput
): Promise<CreateInvoiceResult> {
  const { client, jobs, vatRate, orgId, notes } = input;

  if (!jobs.length) throw new Error("No jobs selected");

  // 1. Duplicate guard — re-check right before creation
  const alreadyInvoiced = await findAlreadyInvoicedJobs(jobs.map((j) => j.id));
  if (alreadyInvoiced.size > 0) {
    const dupes = jobs
      .filter((j) => alreadyInvoiced.has(j.id))
      .map((j) => j.external_job_number || j.id.slice(0, 8));
    throw new Error(
      `These jobs are already invoiced: ${dupes.join(", ")}. Please deselect them.`
    );
  }

  // 2. Compute totals
  const subtotal = jobs.reduce((sum, j) => sum + (j.total_price ?? 0), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  // 3. Generate invoice number
  const invoiceNumber = await getNextInvoiceNumber(orgId);

  // 4. Build line_items JSON (legacy compat with single-job flow)
  const lineItemsJson = jobs.map((j, i) => ({
    description: `Vehicle transport — ${j.vehicle_reg} (${j.vehicle_make} ${j.vehicle_model})`,
    amount: j.total_price ?? 0,
    quantity: 1,
    sort_order: i,
  }));

  // 5. Insert invoice header
  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .insert({
      org_id: orgId,
      client_id: client.id,
      client_name: client.name,
      client_company: client.company ?? null,
      client_email: client.email ?? null,
      client_address: client.address ?? null,
      invoice_number: invoiceNumber,
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      line_items: lineItemsJson,
      notes: notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (invoiceErr || !invoice) {
    throw new Error(invoiceErr?.message ?? "Failed to create invoice header");
  }

  const invoiceId = invoice.id;

  // 6. Insert invoice_items
  const items = jobs.map((j, i) => ({
    invoice_id: invoiceId,
    job_id: j.id,
    description: `Vehicle transport — ${j.vehicle_reg} (${j.vehicle_make} ${j.vehicle_model})`,
    quantity: 1,
    unit_price: j.total_price ?? 0,
    amount: j.total_price ?? 0,
    sort_order: i,
  }));

  const { error: itemsErr } = await supabase
    .from("invoice_items")
    .insert(items);

  if (itemsErr) {
    // Rollback: delete the invoice header
    await supabase.from("invoices").delete().eq("id", invoiceId);
    throw new Error(`Failed to create line items: ${itemsErr.message}`);
  }

  return { invoiceId, invoiceNumber, jobCount: jobs.length };
}
