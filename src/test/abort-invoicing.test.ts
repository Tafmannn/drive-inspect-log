/**
 * Abort invoicing: the dedicated readiness exception and the fee-based invoice line.
 * Normal completed-job rules must be unchanged.
 */
import { describe, it, expect } from "vitest";
import { evaluateInvoiceReadiness, invoiceableAmount, type InvoiceReadinessJob } from "@/lib/invoiceReadiness";
import { buildInvoiceDraft, jobLineDescription, type InvoiceJob } from "@/features/invoicing/lib/invoiceMath";
import { classifyJobsIntoBuckets } from "@/lib/operationsBuckets";

const client = {
  client_id: "c1",
  client_name: "Acme",
  client_company: "Acme Ltd",
  client_email: "billing@acme.test",
};

function aborted(abort: InvoiceReadinessJob["abort"], extra: Partial<InvoiceReadinessJob> = {}): InvoiceReadinessJob {
  return { id: "j1", status: "aborted", total_price: 250, ...client, inspections: [], photos: [], abort, ...extra };
}

describe("Abort invoice readiness", () => {
  it("an unapproved Abort is not invoice-ready", () => {
    const r = evaluateInvoiceReadiness({ job: aborted({ finance_status: "pending_review", approved_amount: null }), alreadyInvoiced: false });
    expect(r.ready).toBe(false);
    expect(r.blockers.map((b) => b.code)).toEqual(["abort_fee_not_approved"]);
  });

  it("an approved Abort is invoice-ready with no inspection, photo or POD", () => {
    const r = evaluateInvoiceReadiness({ job: aborted({ finance_status: "approved", approved_amount: 250 }), alreadyInvoiced: false });
    expect(r.ready).toBe(true);
    expect(r.primaryReason).toMatch(/Abort fee/);
    expect(r.blockers.some((b) => b.code === "evidence_red_or_critical")).toBe(false);
  });

  it("rejected, zero-approved, missing and reopened Aborts are never invoice-ready", () => {
    const codes = (j: InvoiceReadinessJob) => evaluateInvoiceReadiness({ job: j, alreadyInvoiced: false }).blockers.map((b) => b.code);
    expect(codes(aborted({ finance_status: "rejected", approved_amount: null }))).toContain("abort_fee_rejected");
    expect(codes(aborted({ finance_status: "approved", approved_amount: 0 }))).toContain("abort_fee_nil");
    expect(codes(aborted(null))).toContain("abort_not_confirmed");
    expect(codes(aborted({ finance_status: "approved", approved_amount: 250, reopened_at: "2026-11-23T10:00:00Z" }))).toContain("abort_not_confirmed");
  });

  it("the no-name exception gets no special treatment: still needs explicit approval", () => {
    // Readiness only looks at the finance decision, so an exception Abort is pending until approved.
    expect(evaluateInvoiceReadiness({ job: aborted({ finance_status: "pending_review", approved_amount: null }), alreadyInvoiced: false }).ready).toBe(false);
  });

  it("an already-invoiced Abort is blocked (duplicate guard)", () => {
    const r = evaluateInvoiceReadiness({ job: aborted({ finance_status: "approved", approved_amount: 100 }), alreadyInvoiced: true });
    expect(r.ready).toBe(false);
    expect(r.blockers[0].code).toBe("already_invoiced");
  });

  it("billing details are still required", () => {
    const r = evaluateInvoiceReadiness({
      job: aborted({ finance_status: "approved", approved_amount: 100 }, { client_id: null, client_name: null, client_company: null, client_email: null }),
      alreadyInvoiced: false,
    });
    expect(r.blockers.map((b) => b.code)).toContain("missing_client");
  });

  it("invoiceable amount is the approved fee, never the original price", () => {
    expect(invoiceableAmount(aborted({ finance_status: "approved", approved_amount: 100 }))).toBe(100);
    expect(invoiceableAmount(aborted({ finance_status: "pending_review", approved_amount: null }))).toBeNull();
    expect(invoiceableAmount({ status: "completed", total_price: 250 })).toBe(250);
  });

  it("normal completed-job rules are unchanged: cancelled and POD-ready stay blocked", () => {
    const base = { id: "j2", total_price: 250, ...client, inspections: [], photos: [] };
    expect(evaluateInvoiceReadiness({ job: { ...base, status: "cancelled" }, alreadyInvoiced: false }).ready).toBe(false);
    expect(evaluateInvoiceReadiness({ job: { ...base, status: "pod_ready" }, alreadyInvoiced: false }).blockers[0].code).toBe("pod_not_reviewed");
    // A completed job with no evidence is still blocked by evidence health, as before.
    const done = evaluateInvoiceReadiness({ job: { ...base, status: "completed" }, alreadyInvoiced: false });
    expect(done.blockers.some((b) => b.code === "evidence_red_or_critical")).toBe(true);
  });
});

describe("Abort invoice lines", () => {
  const job = (o: Partial<InvoiceJob>): InvoiceJob => ({
    id: "aaaaaaaa-1111", external_job_number: "JOB-7", vehicle_reg: "AB12 CDE", vehicle_make: "Ford", vehicle_model: "Focus",
    job_date: "2026-11-20", completed_at: null, total_price: 250, ...o,
  });

  it("bills the approved partial fee, not the agreed price", () => {
    const d = buildInvoiceDraft({ jobs: [job({ abort_fee: 100 })], expenses: [], vatRegistered: false });
    expect(d.items[0].amount).toBe(100);
    expect(d.subtotal).toBe(100);
    expect(d.lineItems[0].description).toBe("Abort at Collection — JOB-7 — AB12 CDE");
  });

  it("keeps VAT logic unchanged", () => {
    const d = buildInvoiceDraft({ jobs: [job({ abort_fee: 100 })], expenses: [], vatRegistered: true, vatRate: 20 });
    expect(d.vatAmount).toBe(20);
    expect(d.total).toBe(120);
  });

  it("mixes with normal jobs on one multi-job invoice", () => {
    const d = buildInvoiceDraft({
      jobs: [job({ abort_fee: 80 }), job({ id: "bbbbbbbb-2222", external_job_number: "JOB-8", total_price: 300, completed_at: "2026-11-21T10:00:00Z" })],
      expenses: [],
      vatRegistered: false,
    });
    expect(d.subtotal).toBe(380);
    expect(d.items.map((i) => i.amount).sort()).toEqual([300, 80]);
  });

  it("a normal job's description is unchanged", () => {
    expect(jobLineDescription(job({}))).toBe("JOB-7 | 20/11/2026 | AB12 CDE | Ford Focus");
  });
});

describe("operations buckets", () => {
  it("an aborted job is not live work, not 'completed but not invoiced', not evidence-blocked", () => {
    const r = classifyJobsIntoBuckets([{ job: { ...aborted(null), driver_id: "d1" } }]);
    expect(r.assignments[0].buckets).toEqual([]);
  });
});
