import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isAbortFeeReviewLocked,
  ABORT_ELIGIBLE_STATUSES,
  abortConfirmPayload,
  abortErrorMessage,
  abortFormProblem,
  abortInvoiceDescription,
  abortQueueStage,
  approvalAmountProblem,
  canDriverRequestAbort,
  formatAbortConfirmedAt,
  isAbortEligible,
  normaliseContactName,
} from "@/features/abort/lib/abortRules";
import { ADMIN_ALLOWED_TRANSITIONS, JOB_STATUS, TERMINAL_STATUSES, isOperationallyClosed } from "@/lib/statusConfig";
import { isJobLockedForDriver, lockedJobHeading } from "@/lib/driverJobAccess";
import { OVERRIDE_STATUSES, canOverrideFrom, overrideErrorMessage } from "@/lib/jobStatusOverride";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261123100000_job_abort_workflow.sql"),
  "utf8",
);

describe("eligibility", () => {
  it("matches abort_eligible_statuses() in the migration", () => {
    const body = /SELECT ARRAY\[([^\]]+)\]::text\[\]/.exec(MIGRATION)?.[1] ?? "";
    const inSql = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...ABORT_ELIGIBLE_STATUSES].sort());
  });

  it("allows only pre-collection jobs, including a driver who has not reached collection", () => {
    expect(isAbortEligible({ status: "assigned" })).toBe(true);
    expect(isAbortEligible({ status: "ready_for_pickup" })).toBe(true);
    expect(isAbortEligible({ status: "pickup_in_progress" })).toBe(true);
    expect(isAbortEligible({ status: "pickup_complete", has_pickup_inspection: true })).toBe(false);
    expect(isAbortEligible({ status: "in_transit" })).toBe(false);
    expect(isAbortEligible({ status: "completed" })).toBe(false);
  });

  it("never offers a cancelled, already aborted, hidden or collected job", () => {
    expect(isAbortEligible({ status: "cancelled" })).toBe(false);
    expect(isAbortEligible({ status: "aborted" })).toBe(false);
    expect(isAbortEligible({ status: "assigned", is_hidden: true })).toBe(false);
    expect(isAbortEligible({ status: "pickup_in_progress", has_pickup_inspection: true })).toBe(false);
  });

  it("lets a driver ask only on their own job", () => {
    const job = { status: "assigned", driver_id: "d1" };
    expect(canDriverRequestAbort(job, "d1")).toBe(true);
    expect(canDriverRequestAbort(job, "d2")).toBe(false);
    expect(canDriverRequestAbort(job, null)).toBe(false);
  });
});

describe("contact name and the no-name exception", () => {
  it("requires a name unless the exception is ticked; whitespace is not a name", () => {
    expect(abortFormProblem({ contactName: "", noNameException: false })).toMatch(/Enter the name/);
    expect(abortFormProblem({ contactName: "   \t ", noNameException: false })).toMatch(/Enter the name/);
    expect(abortFormProblem({ contactName: "Jane Smith", noNameException: false })).toBeNull();
    expect(abortFormProblem({ contactName: "", noNameException: true })).toBeNull();
    expect(abortFormProblem({ contactName: "x".repeat(121), noNameException: false })).toMatch(/under 120/);
  });

  it("normalises the name and lets a typed name win over the exception", () => {
    expect(normaliseContactName("  Jane   Smith ")).toBe("Jane Smith");
    expect(abortConfirmPayload({ contactName: "  Jane ", noNameException: true })).toEqual({ contactName: "Jane", noNameException: false });
    expect(abortConfirmPayload({ contactName: " ", noNameException: true })).toEqual({ contactName: null, noNameException: true });
  });

  it("is enforced in the database too (name or explicit exception, never both missing)", () => {
    expect(MIGRATION).toContain("CONSTRAINT job_aborts_name_or_exception CHECK");
    expect(MIGRATION).toContain("RAISE EXCEPTION 'CONTACT_NAME_REQUIRED'");
  });
});

describe("Abort confirmed at", () => {
  it("is shown in UK time: GMT in winter", () => {
    expect(formatAbortConfirmedAt("2026-11-23T14:05:00Z")).toBe("23 Nov 2026, 14:05 GMT");
  });

  it("is shown in UK time: BST in summer (one hour ahead of UTC)", () => {
    expect(formatAbortConfirmedAt("2026-07-01T14:05:00Z")).toBe("1 Jul 2026, 15:05 BST");
  });

  it("handles the clock changes (last Sunday of March / October 2026)", () => {
    expect(formatAbortConfirmedAt("2026-03-29T00:59:00Z")).toBe("29 Mar 2026, 00:59 GMT");
    expect(formatAbortConfirmedAt("2026-03-29T01:00:00Z")).toBe("29 Mar 2026, 02:00 BST");
    expect(formatAbortConfirmedAt("2026-10-25T00:59:00Z")).toBe("25 Oct 2026, 01:59 BST");
    expect(formatAbortConfirmedAt("2026-10-25T01:00:00Z")).toBe("25 Oct 2026, 01:00 GMT");
  });

  it("comes from the server's commit, never the client: no timestamp is sent", () => {
    const fn = /FUNCTION public\.confirm_job_abort\(([\s\S]*?)\)\s*RETURNS/.exec(MIGRATION)?.[1] ?? "";
    expect(fn).not.toMatch(/timestamp|_at\b/i);
    expect(MIGRATION).toMatch(/v_uid, now\(\), round\(v_price, 2\)/);
    expect(formatAbortConfirmedAt(null)).toBe("—");
    expect(formatAbortConfirmedAt("not a date")).toBe("—");
  });
});

describe("queue stages and finance", () => {
  const a = (o: Partial<{ finance_status: "pending_review" | "approved" | "rejected"; approved_amount: number | null; reopened_at: string | null }>) => ({
    finance_status: "pending_review" as const, approved_amount: null, reopened_at: null, ...o,
  });

  it("places each Abort in exactly one stage", () => {
    expect(abortQueueStage(a({}))).toBe("awaiting_review");
    expect(abortQueueStage(a({ finance_status: "approved", approved_amount: 120 }))).toBe("ready_to_invoice");
    expect(abortQueueStage(a({ finance_status: "approved", approved_amount: 0 }))).toBe("approved_nil");
    expect(abortQueueStage(a({ finance_status: "rejected" }))).toBe("rejected");
    expect(abortQueueStage(a({ finance_status: "approved", approved_amount: 120 }), { invoiced: true, paid: false })).toBe("invoiced");
    expect(abortQueueStage(a({ finance_status: "approved", approved_amount: 120 }), { invoiced: true, paid: true })).toBe("paid");
    expect(abortQueueStage(a({ reopened_at: "2026-11-23T10:00:00Z" }))).toBe("reopened");
  });

  it("validates approval amounts against the agreed price; unknown price needs an amount", () => {
    expect(approvalAmountProblem("250", 250)).toBeNull();
    expect(approvalAmountProblem("120.50", 250)).toBeNull();
    expect(approvalAmountProblem("0", 250)).toBeNull();
    expect(approvalAmountProblem("251", 250)).toBeNull();
    expect(approvalAmountProblem("12.345", 250)).toMatch(/Enter an amount/);
    expect(approvalAmountProblem("-5", 250)).toMatch(/Enter an amount/);
    expect(approvalAmountProblem("", null)).toMatch(/not known/);
    expect(approvalAmountProblem("90", null)).toBeNull();
  });

  it("describes the invoice line as an Abort at Collection", () => {
    expect(abortInvoiceDescription({ id: "abcdef12-0000", external_job_number: "JOB-1042", vehicle_reg: "ab12 cde" }))
      .toBe("Abort at Collection — JOB-1042 — AB12 CDE");
    expect(abortInvoiceDescription({ id: "abcdef12-0000", external_job_number: null, vehicle_reg: "AB12CDE" }))
      .toBe("Abort at Collection — ABCDEF12 — AB12CDE");
  });

  it("never auto-approves: confirmation always opens a pending_review claim", () => {
    expect(MIGRATION).toMatch(/finance_status\s+text NOT NULL DEFAULT 'pending_review'/);
    const confirm = /FUNCTION public\.confirm_job_abort[\s\S]*?\n\$function\$;/.exec(MIGRATION)?.[0] ?? "";
    expect(confirm).not.toMatch(/finance_status\s*=\s*'approved'/);
    expect(confirm).not.toMatch(/approved_amount/);
  });
});

describe("status integration", () => {
  it("aborted is closed for operations but is not a completed movement", () => {
    expect(isOperationallyClosed(JOB_STATUS.ABORTED)).toBe(true);
    expect(TERMINAL_STATUSES).not.toContain(JOB_STATUS.ABORTED);
  });

  it("the generic status control can never move a job INTO aborted, only reopen it", () => {
    for (const [from, targets] of Object.entries(ADMIN_ALLOWED_TRANSITIONS)) {
      expect(targets, `from ${from}`).not.toContain(JOB_STATUS.ABORTED);
    }
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.ABORTED]).toEqual([JOB_STATUS.READY_FOR_PICKUP]);
  });

  it("the super-admin override cannot set or leave aborted", () => {
    expect(OVERRIDE_STATUSES).not.toContain(JOB_STATUS.ABORTED);
    expect(canOverrideFrom(JOB_STATUS.ABORTED)).toBe(false);
    expect(overrideErrorMessage({ message: "ABORT_STATUS_PROTECTED" })).toMatch(/Abort workflow/);
  });

  it("drivers are locked out of an aborted job and told it was aborted", () => {
    expect(isJobLockedForDriver("aborted", { isAdmin: false, isSuperAdmin: false })).toBe(true);
    expect(isJobLockedForDriver("aborted", { isAdmin: true, isSuperAdmin: false })).toBe(false);
    expect(lockedJobHeading("aborted")).toBe("Job aborted");
  });

  it("the database keeps the driver lock lists in sync", () => {
    expect(MIGRATION.match(/NOT IN \('completed', 'cancelled', 'archived', 'aborted'\)/g)).toHaveLength(2);
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/auth.ts"), "utf8");
    expect(edge).toContain('new Set(["completed", "cancelled", "archived", "aborted"])');
  });
});

describe("database guarantees (static)", () => {
  it("only the workflow can enter or leave 'aborted'", () => {
    expect(MIGRATION).toContain("CREATE TRIGGER trg_jobs_guard_abort_status");
    expect(MIGRATION).toContain("BEFORE INSERT OR UPDATE OF status ON public.jobs");
    expect(MIGRATION).toContain("current_setting('axentra.abort_workflow', true)");
  });

  it("every Abort RPC is SECURITY DEFINER with a pinned search_path and is not callable by anon", () => {
    for (const fn of ["request_job_abort", "dismiss_job_abort_request", "confirm_job_abort", "review_job_abort_claim",
      "notify_customer_job_aborted", "create_abort_replacement_job", "reopen_job"]) {
      const def = new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?AS \\$function\\$`).exec(MIGRATION)?.[0] ?? "";
      expect(def, fn).toContain("SECURITY DEFINER");
      expect(def, fn).toContain("SET search_path TO 'public'");
      expect(MIGRATION).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon;`));
    }
  });

  it("the Abort tables are read-only from the client", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON public.job_aborts, public.job_abort_requests, public.job_abort_events");
    expect(MIGRATION).toContain("GRANT SELECT ON public.job_aborts, public.job_abort_requests, public.job_abort_events TO authenticated;");
    expect(MIGRATION).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*job_abort/);
  });

  it("an invoiced Abort cannot be reopened or re-reviewed", () => {
    expect(MIGRATION).toContain("RAISE EXCEPTION 'ABORT_INVOICED'");
    expect(MIGRATION).toContain("RAISE EXCEPTION 'ABORT_CLAIM_INVOICED'");
  });

  it("has a rollback", () => {
    const down = readFileSync(resolve(process.cwd(), "supabase/rollback/20261123100000_job_abort_workflow.down.sql"), "utf8");
    expect(down).toContain("DROP TABLE IF EXISTS public.job_aborts;");
    expect(down).toContain("CREATE OR REPLACE FUNCTION public.reopen_job");
  });
});

describe("error messages", () => {
  it("turns server codes into plain English and never claims success on network failure", () => {
    expect(abortErrorMessage(new Error("STALE_JOB_STATE"))).toMatch(/changed since you opened it/);
    expect(abortErrorMessage(new Error("ADMIN_OR_SUPER_ADMIN_ONLY"))).toMatch(/Only an admin/);
    expect(abortErrorMessage(new Error("TypeError: Failed to fetch"))).toMatch(/Nothing was saved/);
    expect(abortErrorMessage(new Error("something odd"))).toBe("something odd");
  });
});

describe("Aborts view grouping", () => {
  it("separates requests, fees to review, ready to invoice and settled", async () => {
    const { groupAbortQueue } = await import("@/features/abort/lib/abortQueue");
    const abort = (finance_status: "pending_review" | "approved" | "rejected", approved_amount: number | null) => ({
      id: `a-${finance_status}-${approved_amount}`, finance_status, approved_amount, reopened_at: null,
    });
    const row = (o: Record<string, unknown>) => ({
      jobId: "j", jobRef: "R", vehicleReg: "AB12", client: null, jobStatus: "aborted", at: "", invoiced: false, paid: false, ...o,
    });
    const g = groupAbortQueue([
      row({ kind: "request", jobStatus: "assigned", request: { id: "r1" } }),
      row({ kind: "abort", abort: abort("pending_review", null) }),
      row({ kind: "abort", abort: abort("approved", 120) }),
      row({ kind: "abort", abort: abort("approved", 120), invoiced: true }),
      row({ kind: "abort", abort: abort("rejected", null) }),
    ] as never);
    expect([g.requests.length, g.review.length, g.ready.length, g.settled.length]).toEqual([1, 1, 1, 2]);
  });
});

describe("approved Abort fee lock", () => {
  it("locks ordinary review immediately after approval, before any invoice", () => {
    expect(isAbortFeeReviewLocked("approved", false)).toBe(true);
    expect(isAbortFeeReviewLocked("rejected", false)).toBe(true);
    expect(isAbortFeeReviewLocked("pending_review", false)).toBe(false);
  });

  it("keeps invoiced claims locked even if a stale view shows pending", () => {
    expect(isAbortFeeReviewLocked("pending_review", true)).toBe(true);
    expect(isAbortFeeReviewLocked("approved", true)).toBe(true);
  });
});
