/**
 * Abort workflow API. Every write is a SECURITY DEFINER RPC that re-checks the caller's role,
 * organisation and the job's state (supabase/migrations/20261123100000_job_abort_workflow.sql);
 * the tables themselves are read-only from the client. A call resolves only after the server
 * has committed, so the UI never shows an Abort or a request as done before it is.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { kickCustomerNotifications } from "@/lib/customerNotifyApi";
import { notifyAbortRequested } from "@/lib/pushApi";
import type { AbortFinanceStatus, AbortRequestStatus } from "../lib/abortRules";

// Bind every Abort RPC name and argument shape to the generated database schema.
// RPC return values are JSONB; callers explicitly map each response to its contract.
type AbortRpcName =
  | "request_job_abort"
  | "dismiss_job_abort_request"
  | "confirm_job_abort"
  | "review_job_abort_claim"
  | "amend_approved_job_abort_claim"
  | "correct_invoiced_job_abort_fee"
  | "notify_customer_job_aborted"
  | "create_abort_replacement_job";

async function rpc<T, Name extends AbortRpcName>(
  fn: Name,
  args: Database["public"]["Functions"][Name]["Args"],
): Promise<T> {
  // Supabase's generic overload cannot distribute a union of RPC signatures,
  // so only the internal call needs a cast; arguments above remain schema-checked.
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}

export interface JobAbort {
  id: string;
  org_id: string;
  job_id: string;
  run_id: string | null;
  from_status: string;
  driver_id: string | null;
  contact_name: string | null;
  no_name_exception: boolean;
  confirmed_by: string;
  confirmed_at: string;
  agreed_price: number | null;
  proposed_amount: number | null;
  approved_amount: number | null;
  client_fee_confirmed_by: string | null;
  client_fee_confirmed_at: string | null;
  client_fee_confirmed_amount: number | null;
  finance_status: AbortFinanceStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  last_amended_at: string | null;
  last_amended_by: string | null;
  last_amendment_reason: string | null;
  customer_notified_at: string | null;
  reopened_at: string | null;
}

export interface JobAbortRequest {
  id: string;
  job_id: string;
  run_id: string | null;
  driver_id: string;
  requested_at: string;
  status: AbortRequestStatus;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface JobAbortEvent {
  id: string;
  action: string;
  actor_id: string | null;
  finance_status: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function toAbort(r: Record<string, unknown>): JobAbort {
  return {
    ...(r as unknown as JobAbort),
    agreed_price: num(r.agreed_price),
    proposed_amount: num(r.proposed_amount),
    approved_amount: num(r.approved_amount),
    client_fee_confirmed_amount: num(r.client_fee_confirmed_amount),
  };
}

// ── driver ────────────────────────────────────────────────────────────────
export async function requestJobAbort(jobId: string): Promise<{ requestId: string; duplicate: boolean; requestedAt: string }> {
  const res = await rpc<{ requestId: string; duplicate: boolean; requestedAt: string }, "request_job_abort">("request_job_abort", { p_job_id: jobId });
  if (!res.duplicate) notifyAbortRequested(jobId);
  return res;
}

/** The pending request on a job (RLS: a driver sees only their own). */
export async function getPendingAbortRequest(jobId: string): Promise<JobAbortRequest | null> {
  const { data, error } = await supabase
    .from("job_abort_requests")
    .select("id, job_id, run_id, driver_id, requested_at, status, resolved_at, resolution_note")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as JobAbortRequest | null) ?? null;
}

// ── admin ─────────────────────────────────────────────────────────────────
export interface ConfirmAbortResult {
  abortId: string;
  confirmedAt: string;
  contactName: string | null;
  noNameException: boolean;
  financeStatus: AbortFinanceStatus;
  alreadyAborted: boolean;
}

export function confirmJobAbort(input: {
  jobId: string;
  contactName: string | null;
  noNameException: boolean;
  expectedStatus: string;
}): Promise<ConfirmAbortResult> {
  return rpc<ConfirmAbortResult, "confirm_job_abort">("confirm_job_abort", {
    p_job_id: input.jobId,
    p_contact_name: input.contactName ?? "",
    p_no_name_exception: input.noNameException,
    p_expected_status: input.expectedStatus,
  });
}

export function dismissAbortRequest(requestId: string, note?: string): Promise<{ status: string }> {
  return rpc<{ status: string }, "dismiss_job_abort_request">("dismiss_job_abort_request", { p_request_id: requestId, p_note: note ?? undefined });
}

export function reviewAbortClaim(input: {
  abortId: string;
  decision: "approved" | "rejected";
  amount?: number | null;
  note?: string | null;
  clientConfirmed?: boolean;
}): Promise<{ financeStatus: AbortFinanceStatus; approvedAmount: number | null; clientConfirmedAt?: string }> {
  return rpc<{ financeStatus: AbortFinanceStatus; approvedAmount: number | null }, "review_job_abort_claim">("review_job_abort_claim", {
    p_abort_id: input.abortId,
    p_decision: input.decision,
    p_client_confirmed: input.clientConfirmed === true,
    p_amount: input.amount ?? undefined,
    p_note: input.note ?? undefined,
  });
}

/** Exceptional correction of a signed-off fee. Server restricts to Super Admin,
 * requires a reason, checks the expected old amount and refuses invoiced claims. */
export function amendApprovedAbortClaim(input: {
  abortId: string;
  newAmount: number;
  expectedAmount: number;
  reason: string;
  clientConfirmed?: boolean;
}): Promise<{ financeStatus: AbortFinanceStatus; approvedAmount: number; amendedAt: string }> {
  return rpc<{ financeStatus: AbortFinanceStatus; approvedAmount: number; amendedAt: string }, "amend_approved_job_abort_claim">(
    "amend_approved_job_abort_claim",
    {
      p_abort_id: input.abortId,
      p_new_amount: input.newAmount,
      p_expected_amount: input.expectedAmount,
      p_reason: input.reason,
      p_client_confirmed: input.clientConfirmed === true,
    },
  );
}

/** Fully credit the original Abort invoice and amend its approved fee in one
 * database transaction. Never issues the replacement invoice automatically. */
export function correctInvoicedAbortFee(input: {
  abortId: string;
  originalInvoiceId: string;
  newAmount: number;
  expectedAmount: number;
  reason: string;
  clientConfirmed: boolean;
  multiJobAcknowledged: boolean;
  paidAcknowledged: boolean;
}): Promise<{
  correctionId: string;
  creditNoteId: string | null;
  originalInvoiceNumber: string;
  approvedAmount: number;
  otherJobsToReinvoice: number;
  originalWasPaid: boolean;
}> {
  return rpc<{
    correctionId: string;
    creditNoteId: string | null;
    originalInvoiceNumber: string;
    approvedAmount: number;
    otherJobsToReinvoice: number;
    originalWasPaid: boolean;
  }, "correct_invoiced_job_abort_fee">("correct_invoiced_job_abort_fee", {
    p_abort_id: input.abortId,
    p_original_invoice_id: input.originalInvoiceId,
    p_new_amount: input.newAmount,
    p_expected_amount: input.expectedAmount,
    p_reason: input.reason,
    p_client_confirmed: input.clientConfirmed,
    p_multi_job_acknowledged: input.multiJobAcknowledged,
    p_paid_acknowledged: input.paidAcknowledged,
  });
}

export interface AbortInvoiceContext {
  id: string;
  invoice_number: string;
  status: string;
  total: number | null;
  client_id: string | null;
  otherJobCount: number;
}

export interface AbortInvoiceCorrection {
  id: string;
  original_invoice_id: string;
  credit_note_id: string | null;
  replacement_invoice_id: string | null;
  original_invoice_number: string;
  previous_fee: number;
  revised_fee: number;
  other_jobs_on_invoice: number;
  original_was_paid: boolean;
  created_at: string;
  reason: string;
}

export interface AbortInvoiceDetails {
  activeInvoice: AbortInvoiceContext | null;
  corrections: AbortInvoiceCorrection[];
}

/** Includes both multi-job and legacy invoice paths, and never treats
 * cancelled or voided invoices as active. */
export async function getAbortInvoiceDetails(jobId: string): Promise<AbortInvoiceDetails> {
  const [items, legacy, corrections] = await Promise.all([
    supabase.from("invoice_items")
      .select("invoice_id, invoices(id,invoice_number,status,total,client_id,document_type)")
      .eq("job_id",jobId).eq("voided",false),
    supabase.from("invoices")
      .select("id,invoice_number,status,total,client_id,document_type")
      .eq("job_id",jobId).neq("status","cancelled"),
    supabase.from("job_abort_invoice_corrections")
      .select("id,original_invoice_id,credit_note_id,replacement_invoice_id,original_invoice_number,previous_fee,revised_fee,other_jobs_on_invoice,original_was_paid,created_at,reason")
      .eq("job_id",jobId).order("created_at",{ascending:false}),
  ]);
  if (items.error || legacy.error || corrections.error) {
    throw new Error(items.error?.message ?? legacy.error?.message ?? corrections.error?.message);
  }
  type InvoiceRow = { id: string; invoice_number: string; status: string;
    total: number | null; client_id: string | null; document_type: string | null };
  const active = new Map<string, InvoiceRow>();
  for (const entry of items.data ?? []) {
    const invoice = entry.invoices as InvoiceRow | null;
    if (invoice?.status !== "cancelled" && invoice?.document_type === "invoice") {
      active.set(invoice.id, invoice);
    }
  }
  for (const invoice of (legacy.data ?? []) as InvoiceRow[]) {
    if (invoice.status !== "cancelled" && invoice.document_type === "invoice") {
      active.set(invoice.id, invoice);
    }
  }
  // Multiple active invoices for one job indicate accounting inconsistency.
  // Refuse to select one arbitrarily for a credit-note correction.
  if (active.size > 1) throw new Error("Multiple active invoices found for this job. Resolve the invoice records first.");
  let activeInvoice: AbortInvoiceContext | null = null;
  const invoice = [...active.values()][0];
  if (invoice) {
    const { data, error } = await supabase.from("invoice_items")
      .select("job_id").eq("invoice_id",invoice.id).eq("voided",false);
    if (error) throw new Error(error.message);
    const otherJobs = new Set((data ?? []).map((row) => row.job_id)
      .filter((id): id is string => !!id && id !== jobId));
    activeInvoice = {
      ...invoice,
      total: invoice.total == null ? null : Number(invoice.total),
      otherJobCount: otherJobs.size,
    };
  }
  return {
    activeInvoice,
    corrections: (corrections.data ?? []).map((row) => ({
      ...row,
      previous_fee: Number(row.previous_fee),
      revised_fee: Number(row.revised_fee),
    })),
  };
}

export async function notifyCustomerAborted(abortId: string): Promise<{ queued: boolean; alreadyQueued: boolean }> {
  const res = await rpc<{ queued: boolean; alreadyQueued: boolean }, "notify_customer_job_aborted">("notify_customer_job_aborted", { p_abort_id: abortId });
  if (res.queued) kickCustomerNotifications();
  return res;
}

export function createReplacementJob(jobId: string): Promise<{ jobId: string; jobRef: string | null; alreadyExists: boolean }> {
  return rpc<{ jobId: string; jobRef: string | null; alreadyExists: boolean }, "create_abort_replacement_job">("create_abort_replacement_job", { p_job_id: jobId });
}

export interface JobAbortState {
  /** The Abort for the job's current run (not reopened), if any. */
  current: JobAbort | null;
  /** Every Abort ever confirmed on the job, newest first (history survives reopening). */
  history: JobAbort[];
  pendingRequest: JobAbortRequest | null;
  events: JobAbortEvent[];
  invoiced: boolean;
  paid: boolean;
  replacementJobId: string | null;
}

/** Admin view of a job's Abort state. Fails loudly: an unknown state is never shown as "none". */
export async function getJobAbortState(jobId: string): Promise<JobAbortState> {
  const [aborts, requests, events, items, legacy, replacement] = await Promise.all([
    supabase.from("job_aborts").select("*").eq("job_id", jobId).order("confirmed_at", { ascending: false }),
    supabase.from("job_abort_requests")
      .select("id, job_id, run_id, driver_id, requested_at, status, resolved_at, resolution_note")
      .eq("job_id", jobId).eq("status", "pending"),
    supabase.from("job_abort_events")
      .select("id, action, actor_id, finance_status, amount, note, created_at")
      .eq("job_id", jobId).order("created_at", { ascending: true }),
    supabase.from("invoice_items").select("voided, invoices(status)").eq("job_id", jobId),
    supabase.from("invoices").select("status, document_type").eq("job_id", jobId),
    supabase.from("jobs").select("id").eq("rebooked_from_job_id", jobId).limit(1),
  ]);
  const err = aborts.error ?? requests.error ?? events.error ?? items.error ?? legacy.error ?? replacement.error;
  if (err) throw new Error(`Could not load the Abort: ${err.message}`);

  const history = ((aborts.data ?? []) as unknown as Record<string, unknown>[]).map(toAbort);
  const liveItems = ((items.data ?? []) as unknown as { voided?: boolean; invoices?: { status?: string } | null }[])
    .filter((i) => !i.voided && i.invoices?.status !== "cancelled");
  const liveLegacy = ((legacy.data ?? []) as unknown as { status?: string; document_type?: string }[])
    .filter((i) => i.status !== "cancelled" && (i.document_type ?? "invoice") === "invoice");
  const statuses = [...liveItems.map((i) => i.invoices?.status), ...liveLegacy.map((i) => i.status)];

  return {
    current: history.find((a) => !a.reopened_at) ?? null,
    history,
    pendingRequest: ((requests.data ?? []) as unknown as JobAbortRequest[])[0] ?? null,
    events: (events.data ?? []) as unknown as JobAbortEvent[],
    invoiced: statuses.length > 0,
    paid: statuses.length > 0 && statuses.every((s) => s === "paid"),
    replacementJobId: ((replacement.data ?? []) as { id: string }[])[0]?.id ?? null,
  };
}

export interface AbortQueueRow {
  kind: "request" | "abort";
  jobId: string;
  jobRef: string;
  vehicleReg: string;
  client: string | null;
  jobStatus: string;
  at: string;
  request?: JobAbortRequest;
  abort?: JobAbort;
  invoiced: boolean;
  paid: boolean;
}

/** Everything the Aborts view lists: pending driver requests and every current Abort. */
export async function listAbortQueue(): Promise<AbortQueueRow[]> {
  const [reqRes, abortRes] = await Promise.all([
    supabase.from("job_abort_requests")
      .select("id, job_id, run_id, driver_id, requested_at, status, resolved_at, resolution_note")
      .eq("status", "pending").order("requested_at", { ascending: true }).limit(200),
    supabase.from("job_aborts").select("*").is("reopened_at", null)
      .order("confirmed_at", { ascending: false }).limit(300),
  ]);
  const err = reqRes.error ?? abortRes.error;
  if (err) throw new Error(`Could not load Aborts: ${err.message}`);
  const requests = (reqRes.data ?? []) as unknown as JobAbortRequest[];
  const aborts = ((abortRes.data ?? []) as unknown as Record<string, unknown>[]).map(toAbort);

  const jobIds = [...new Set([...requests.map((r) => r.job_id), ...aborts.map((a) => a.job_id)])];
  if (jobIds.length === 0) return [];

  const [jobsRes, itemsRes, legacyRes] = await Promise.all([
    supabase.from("jobs")
      .select("id, external_job_number, vehicle_reg, client_company, client_name, status, is_test")
      .in("id", jobIds),
    supabase.from("invoice_items").select("job_id, voided, invoices(status)").in("job_id", jobIds),
    supabase.from("invoices").select("job_id, status, document_type").in("job_id", jobIds),
  ]);
  const err2 = jobsRes.error ?? itemsRes.error ?? legacyRes.error;
  if (err2) throw new Error(`Could not load Aborts: ${err2.message}`);

  const jobs = new Map((jobsRes.data ?? []).map((j) => [j.id, j]));
  const invoiceStatuses = new Map<string, string[]>();
  const push = (id: string | null, s: string | undefined) => {
    if (!id || !s || s === "cancelled") return;
    invoiceStatuses.set(id, [...(invoiceStatuses.get(id) ?? []), s]);
  };
  for (const i of (itemsRes.data ?? []) as unknown as { job_id: string | null; voided?: boolean; invoices?: { status?: string } | null }[]) {
    if (!i.voided) push(i.job_id, i.invoices?.status);
  }
  for (const i of (legacyRes.data ?? []) as unknown as { job_id: string | null; status?: string; document_type?: string }[]) {
    if ((i.document_type ?? "invoice") === "invoice") push(i.job_id, i.status);
  }

  const rows: AbortQueueRow[] = [];
  const base = (jobId: string) => {
    const j = jobs.get(jobId);
    const st = invoiceStatuses.get(jobId) ?? [];
    return {
      jobId,
      jobRef: j?.external_job_number || jobId.slice(0, 8).toUpperCase(),
      vehicleReg: j?.vehicle_reg ?? "",
      client: j?.client_company || j?.client_name || null,
      jobStatus: j?.status ?? "unknown",
      invoiced: st.length > 0,
      paid: st.length > 0 && st.every((s) => s === "paid"),
      isTest: !!j?.is_test,
    };
  };
  for (const r of requests) {
    const b = base(r.job_id);
    if (!b.isTest) rows.push({ ...b, kind: "request", at: r.requested_at, request: r });
  }
  for (const a of aborts) {
    const b = base(a.job_id);
    // An Abort whose job was moved on some other way is not current work.
    if (!b.isTest && b.jobStatus === "aborted") rows.push({ ...b, kind: "abort", at: a.confirmed_at, abort: a });
  }
  return rows;
}

/** The current (not reopened) Abort of each job, keyed by job id — the invoice-prep exception path. */
export async function getCurrentAbortsForJobs(jobIds: string[]): Promise<Map<string, JobAbort>> {
  const out = new Map<string, JobAbort>();
  if (jobIds.length === 0) return out;
  const { data, error } = await supabase.from("job_aborts").select("*").in("job_id", jobIds).is("reopened_at", null);
  if (error) throw new Error(`Could not load Abort fees: ${error.message}`);
  for (const r of ((data ?? []) as unknown as Record<string, unknown>[]).map(toAbort)) out.set(r.job_id, r);
  return out;
}
