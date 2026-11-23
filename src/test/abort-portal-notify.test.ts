/** Customer-facing side of an Abort: portal stage, the optional email, push payloads. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAGE_LABEL, STAGE_NEXT, isActiveStage, portalStage, progressIndex, timelineSteps } from "@/features/portal/lib/portalStatus";
import { renderStatusEmail, skipReasonFor } from "../../supabase/functions/_shared/customerStatusEmail";
import { parsePushPayload, clickUrlFor } from "@/lib/pushPayload";

const MIGRATION = readFileSync(resolve(process.cwd(), "supabase/migrations/20261123100000_job_abort_workflow.sql"), "utf8");

describe("customer portal", () => {
  it("shows Aborted, never collected or delivered, and no progress position", () => {
    expect(portalStage("aborted")).toBe("aborted");
    expect(STAGE_LABEL.aborted).toBe("Aborted");
    expect(STAGE_NEXT.aborted).toMatch(/not collected/);
    expect(STAGE_NEXT.aborted).not.toMatch(/delivered/i);
    expect(isActiveStage("aborted")).toBe(false);
    expect(progressIndex("aborted")).toBeNull();
  });

  it("the timeline ends at Aborted after a collection attempt", () => {
    const steps = timelineSteps([
      { status: "assigned", at: "1" },
      { status: "pickup_in_progress", at: "2" },
      { status: "aborted", at: "3" },
    ]);
    expect(steps.map((s) => s.stage)).toEqual(["assigned", "collecting", "aborted"]);
  });
});

describe("customer email", () => {
  const base = {
    operator: { name: "Axentra" },
    clientName: "Acme",
    job: { reg: "ab12 cde", make: "Ford", model: "Focus", ref: "JOB-7", fromPlace: "Leeds", toPlace: "York" },
    at: "2026-11-23T14:05:00Z",
  };

  it("is never queued automatically: the status trigger only knows collected / delivered", () => {
    const trigger = readFileSync(resolve(process.cwd(), "supabase/migrations/20261113184311_customer_status_emails.sql"), "utf8");
    expect(trigger).not.toMatch(/aborted/);
    // Only the admin RPC queues an 'aborted' row.
    expect(MIGRATION.match(/VALUES \(v_abort\.org_id, v_abort\.job_id, v_job\.client_id, 'aborted'\)/g)).toHaveLength(1);
  });

  it("says the vehicle was not collected and leaks no internal detail", () => {
    const e = renderStatusEmail({ ...base, event: "aborted" });
    expect(e.subject).toBe("Collection aborted: AB12 CDE");
    expect(e.text).toMatch(/was not collected/);
    expect(e.text).toMatch(/Aborted: .*23 Nov 2026/);
    expect(e.text).not.toMatch(/delivered|£|fee|exception/i);
  });

  it("is skipped if the job was reopened before sending; collected/delivered skip once aborted", () => {
    const job = { status: "aborted", client_id: "c1" };
    expect(skipReasonFor("aborted", job, "c1")).toBeNull();
    expect(skipReasonFor("aborted", { ...job, status: "ready_for_pickup" }, "c1")).toBe("job_not_aborted");
    expect(skipReasonFor("collected", job, "c1")).toBe("job_aborted");
  });
});

describe("push to admins on a driver request", () => {
  it("accepts the abort-requested payload and opens the job", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(parsePushPayload(JSON.stringify({ type: "abort-requested", jobId: id, title: "Abort requested", body: "AB12" }))?.type)
      .toBe("abort-requested");
    expect(clickUrlFor(id, "abort-requested")).toBe(`/jobs/${id}`);
  });

  it("the sender only pushes while a request is pending", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/send-push/index.ts"), "utf8");
    expect(fn).toContain('.from("job_abort_requests")');
    expect(fn).toContain('NO_PENDING_ABORT_REQUEST');
  });
});
