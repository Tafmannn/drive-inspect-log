/**
 * Super-admin status override: the pure rules, the API wrapper, and that the app's
 * rules match the database migration they depend on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { JOB_STATUS } from "@/lib/statusConfig";
import {
  MIN_REASON_LENGTH,
  OVERRIDE_STATUSES,
  overrideErrorMessage,
  overrideStatusLabel,
  overrideTargets,
  overrideWarnings,
  reasonProblem,
} from "@/lib/jobStatusOverride";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { superAdminOverrideStatus } from "@/lib/jobStatusOverrideApi";

const MIGRATION = "supabase/migrations/20261120100000_super_admin_job_status_override.sql";
const ROLLBACK = "supabase/rollback/20261120100000_super_admin_job_status_override.down.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("status list", () => {
  it("offers every job status, and the database function accepts exactly the same list", () => {
    expect([...OVERRIDE_STATUSES].sort()).toEqual(Object.values(JOB_STATUS).sort());
    const body = /v_valid\s+text\[\] := ARRAY\[([\s\S]*?)\];/.exec(sql)?.[1] ?? "";
    const inSql = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...OVERRIDE_STATUSES].sort());
  });

  it("the picker leaves out the status the job is already in", () => {
    expect(overrideTargets("completed")).not.toContain("completed");
    expect(overrideTargets("completed")).toContain("ready_for_pickup");
    expect(overrideTargets("completed")).toHaveLength(OVERRIDE_STATUSES.length - 1);
  });

  it("labels use the precise name, not the coarse badge text", () => {
    expect(overrideStatusLabel("ready_for_pickup")).toBe("Ready For Pickup");
    expect(overrideStatusLabel("delivery_complete")).toBe("Delivery Complete");
  });
});

describe("reason", () => {
  it("needs the same minimum length as the database", () => {
    expect(MIN_REASON_LENGTH).toBe(5);
    expect(sql).toMatch(/char_length\(v_reason\) < 5/);
    expect(reasonProblem("")).toMatch(/Enter a reason/);
    expect(reasonProblem("   ")).toMatch(/Enter a reason/);
    expect(reasonProblem(" abcd ")).toMatch(/at least 5/);
    expect(reasonProblem("Test job")).toBeNull();
  });
});

describe("warnings", () => {
  it("leaving completed says the completion date is cleared and billing lists change", () => {
    const w = overrideWarnings("completed", "ready_for_pickup").join(" ");
    expect(w).toMatch(/completion date is cleared/i);
    expect(w).toMatch(/Ready to invoice/);
  });

  it("completing says it counts as completed and that no customer email is sent", () => {
    const w = overrideWarnings("assigned", "completed");
    expect(w.join(" ")).toMatch(/counts as completed/);
    expect(w.join(" ")).toMatch(/No collected \/ delivered email/);
  });

  it("closing a job warns that drivers lose access", () => {
    for (const to of ["cancelled", "archived", "failed"]) {
      expect(overrideWarnings("assigned", to).join(" ")).toMatch(/Drivers lose access/);
    }
  });

  it("moving onto the road or to a delivered state promises no customer email", () => {
    for (const to of ["in_transit", "pickup_complete", "delivery_in_progress", "delivery_complete", "pod_ready"]) {
      expect(overrideWarnings("assigned", to).join(" ")).toMatch(/No collected \/ delivered email/);
    }
  });

  it("a plain move still gets one line, so the user never confirms blind", () => {
    const w = overrideWarnings("draft", "ready_for_pickup");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/Only the status changes/);
  });
});

describe("error messages", () => {
  it.each([
    ["SUPER_ADMIN_ONLY", /Only a super admin/],
    ["REASON_REQUIRED", /reason of at least 5/],
    ["INVALID_STATUS", /not a valid job status/],
    ["JOB_NOT_FOUND", /could not be found/],
    ["JOB_ALREADY_IN_STATUS", /already in that status/],
    ["JOB_ON_LIVE_INVOICE", /Cancel the invoice first/],
  ])("%s is turned into a sentence", (code, expected) => {
    expect(overrideErrorMessage({ message: `${code}` })).toMatch(expected);
  });

  it("falls back to the raw text, then to a generic line", () => {
    expect(overrideErrorMessage({ message: "boom" })).toBe("boom");
    expect(overrideErrorMessage(null)).toMatch(/could not be changed/);
  });
});

describe("superAdminOverrideStatus", () => {
  beforeEach(() => { rpc.mockReset(); });

  it("calls the database function with the trimmed reason and returns its result", async () => {
    rpc.mockResolvedValue({ data: { fromStatus: "completed", toStatus: "ready_for_pickup", removedNotifications: 0 }, error: null });
    const r = await superAdminOverrideStatus("job-1", "ready_for_pickup", "  Test job  ");
    expect(rpc).toHaveBeenCalledWith("super_admin_override_job_status", {
      p_job_id: "job-1", p_new_status: "ready_for_pickup", p_reason: "Test job",
    });
    expect(r).toEqual({ fromStatus: "completed", toStatus: "ready_for_pickup", removedNotifications: 0 });
  });

  it("does not call the database when the reason is too short", async () => {
    await expect(superAdminOverrideStatus("job-1", "assigned", "no")).rejects.toThrow(/at least 5/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("turns a database refusal into a readable error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "JOB_ON_LIVE_INVOICE" } });
    await expect(superAdminOverrideStatus("job-1", "assigned", "Test job")).rejects.toThrow(/Cancel the invoice first/);
  });

  it("copes with an empty result", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(superAdminOverrideStatus("job-1", "assigned", "Test job"))
      .resolves.toEqual({ fromStatus: "", toStatus: "assigned", removedNotifications: 0 });
  });
});

describe("the migration", () => {
  it("only a super admin can call it, anon cannot execute it, and the audit table is not writable by callers", () => {
    expect(sql).toMatch(/NOT public\.is_super_admin\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.super_admin_override_job_status\(uuid, text, text\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON public\.job_status_overrides FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON public\.job_status_overrides TO authenticated/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.job_status_overrides/);
  });

  it("guards invoices, never messages customers, and records who and why", () => {
    expect(sql).toMatch(/JOB_ON_LIVE_INVOICE/);
    expect(sql).toMatch(/NOT COALESCE\(ii\.voided, false\)/);
    expect(sql).toMatch(/i\.status <> 'cancelled'/);
    expect(sql).toMatch(/DELETE FROM public\.customer_notifications/);
    expect(sql).toMatch(/created_at = now\(\)/);
    expect(sql).toMatch(/INSERT INTO public\.job_status_overrides/);
    expect(sql).toMatch(/'super_admin_status_override'/);
  });

  it("has a matching rollback", () => {
    expect(existsSync(resolve(process.cwd(), ROLLBACK))).toBe(true);
    const down = readFileSync(resolve(process.cwd(), ROLLBACK), "utf8");
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.super_admin_override_job_status/);
    expect(down).toMatch(/DROP TABLE IF EXISTS public\.job_status_overrides/);
  });
});
