/**
 * createInvoice – multi-job invoice creation, with rechargeable expenses.
 *
 * Flow:
 *   1. Re-verify no selected job or expense is already invoiced
 *   2. Build the invoice (one line per job: transport + its expenses)
 *   3. Allocate the next invoice number
 *   4. Insert invoice header (draft)
 *   5. Insert invoice_items (one per job) and invoice_expenses (one per
 *      recharged expense, with a snapshot and its receipt ref)
 *   6. If any step fails → delete the header (cascades to its lines)
 *
 * Supabase JS doesn't expose real DB transactions, so we use a
 * best-effort insert-then-rollback pattern. The pre-checks at step 1 give
 * a friendly message; the unique indexes on invoice_items.job_id and
 * invoice_expenses.expense_id are the real guarantee.
 */

import { supabase } from "@/integrations/supabase/client";
import type { EligibleJob } from "../hooks/useInvoicePrepData";
import type { Client } from "@/lib/clientApi";
import {
  buildInvoiceDraft,
  dueDateFor,
  jobRef,
  paymentTermsLabel,
  type BillableExpense,
  type InvoiceDraft,
} from "../lib/invoiceMath";

export interface CreateInvoiceInput {
  client: Client;
  jobs: EligibleJob[];
  /** Expenses the admin ticked to recharge. Omit / empty for none. */
  expenses?: BillableExpense[];
  /** The business-level VAT switch (organisations.vat_registered). */
  vatRegistered: boolean;
  /** Only used when vatRegistered is true. */
  vatRate: number;
  orgId: string;
  /** Client's PO / reference. */
  clientRef?: string;
  notes?: string;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  jobCount: number;
  issueDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  draft: InvoiceDraft;
}

/**
 * Get the next sequential invoice number for the org.
 *
 * Delegates to the `allocate_invoice_number` RPC, which increments a
 * per-org counter atomically under a row lock. This replaces the old
 * read-max-then-add-one approach, which raced under concurrency and
 * produced duplicate numbers.
 */
async function getNextInvoiceNumber(orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_invoice_number", {
    p_org_id: orgId,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to allocate an invoice number");
  }
  return data as string;
}

/**
 * Check which job IDs are already invoiced, via EITHER invoicing path:
 * the multi-job flow (a row in invoice_items) or the legacy single-job
 * flow (InvoiceGenerator.tsx writes invoices.job_id directly and never
 * creates an invoice_items row). WORKFLOW-008: checking invoice_items
 * alone let a job invoiced through one path silently be invoiced again
 * through the other, since neither flow knew about the other's storage.
 */
export async function findAlreadyInvoicedJobs(jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const [itemsResult, legacyResult] = await Promise.all([
    supabase.from("invoice_items").select("job_id, voided").in("job_id", jobIds),
    supabase.from("invoices").select("job_id, status").in("job_id", jobIds),
  ]);
  const ids = new Set<string>();
  // A cancelled invoice releases its jobs: its items are flagged voided, and
  // a cancelled legacy single-job invoice no longer claims its job.
  for (const r of (itemsResult.data ?? []) as { job_id: string | null; voided?: boolean }[]) {
    if (r.job_id && !r.voided) ids.add(r.job_id);
  }
  for (const r of (legacyResult.data ?? []) as { job_id: string | null; status?: string }[]) {
    if (r.job_id && r.status !== "cancelled") ids.add(r.job_id);
  }
  return ids;
}

/** Which of these expenses are already on a (non-cancelled) invoice. */
export async function findAlreadyInvoicedExpenses(expenseIds: string[]): Promise<Set<string>> {
  if (expenseIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("invoice_expenses")
    .select("expense_id, voided")
    .in("expense_id", expenseIds);
  if (error) throw new Error(`Could not check invoiced expenses: ${error.message}`);
  const ids = new Set<string>();
  for (const r of data ?? []) if (r.expense_id && !r.voided) ids.add(r.expense_id);
  return ids;
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function createMultiJobInvoice(
  input: CreateInvoiceInput
): Promise<CreateInvoiceResult> {
  const { client, jobs, vatRegistered, vatRate, orgId } = input;
  const jobIdSet = new Set(jobs.map((j) => j.id));
  // Never bill an expense whose job is not on this invoice.
  const expenses = (input.expenses ?? []).filter((e) => jobIdSet.has(e.job_id));
  const clientRef = input.clientRef?.trim() || null;

  if (!jobs.length) throw new Error("No jobs selected");
  if (client.po_required && !clientRef) {
    throw new Error(`${client.company || client.name} requires a PO / reference on every invoice.`);
  }

  // 1. Duplicate guards — re-check right before creation
  const [alreadyInvoiced, expensesInvoiced] = await Promise.all([
    findAlreadyInvoicedJobs(jobs.map((j) => j.id)),
    findAlreadyInvoicedExpenses(expenses.map((e) => e.id)),
  ]);
  if (alreadyInvoiced.size > 0) {
    const dupes = jobs.filter((j) => alreadyInvoiced.has(j.id)).map((j) => jobRef(j));
    throw new Error(
      `These jobs are already invoiced: ${dupes.join(", ")}. Please deselect them.`
    );
  }
  if (expensesInvoiced.size > 0) {
    throw new Error(
      `${expensesInvoiced.size} selected expense${expensesInvoiced.size === 1 ? " is" : "s are"} already on another invoice. Refresh and try again.`
    );
  }

  // 2. Build the document
  const draft = buildInvoiceDraft({ jobs, expenses, vatRegistered, vatRate });

  // 3. Generate invoice number
  const invoiceNumber = await getNextInvoiceNumber(orgId);

  const issueDate = todayIso();
  const dueDate = dueDateFor(issueDate, client.payment_terms);
  const paymentTerms = paymentTermsLabel(client.payment_terms) ?? null;

  // 4. Insert invoice header
  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .insert({
      org_id: orgId,
      client_id: client.id,
      client_name: client.name,
      client_company: client.company ?? null,
      client_email: client.billing_email || client.email || null,
      client_address: client.billing_address || client.address || null,
      client_ref: clientRef,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      payment_terms: paymentTerms,
      subtotal: draft.subtotal,
      expenses_total: draft.expensesTotal,
      vat_registered: vatRegistered,
      vat_rate: draft.vatRate,
      vat_amount: draft.vatAmount,
      total: draft.total,
      line_items: draft.lineItems as unknown as never,
      notes: input.notes?.trim() || null,
      status: "draft",
    })
    .select("id")
    .single();

  if (invoiceErr || !invoice) {
    throw new Error(invoiceErr?.message ?? "Failed to create invoice header");
  }

  const invoiceId = invoice.id;
  // Deleting the draft header cascades to any lines already written.
  const rollback = () => supabase.from("invoices").delete().eq("id", invoiceId);

  // 5a. Insert invoice_items
  const { error: itemsErr } = await supabase
    .from("invoice_items")
    .insert(draft.items.map((it) => ({ invoice_id: invoiceId, ...it })));

  if (itemsErr) {
    await rollback();
    // 23505 = unique_violation on invoice_items.job_id: a concurrent invoice
    // claimed one of these jobs after our duplicate guard ran (TOCTOU). The
    // DB constraint is the real safety net; surface a clear message.
    if ((itemsErr as { code?: string }).code === "23505") {
      throw new Error(
        "One or more selected jobs were just invoiced on another invoice. Refresh and try again.",
      );
    }
    throw new Error(`Failed to create line items: ${itemsErr.message}`);
  }

  // 5b. Insert invoice_expenses (snapshot + receipt ref per recharged expense)
  if (draft.expenseLines.length > 0) {
    const { error: expErr } = await supabase.from("invoice_expenses").insert(
      draft.expenseLines.map(({ receipts: _receipts, ...line }) => ({
        invoice_id: invoiceId,
        ...line,
      })),
    );
    if (expErr) {
      await rollback();
      if ((expErr as { code?: string }).code === "23505") {
        throw new Error(
          "One or more selected expenses were just billed on another invoice. Refresh and try again.",
        );
      }
      throw new Error(`Failed to save invoice expenses: ${expErr.message}`);
    }
  }

  return {
    invoiceId,
    invoiceNumber,
    jobCount: jobs.length,
    issueDate,
    dueDate,
    paymentTerms,
    draft,
  };
}
