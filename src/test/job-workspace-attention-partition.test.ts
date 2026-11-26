import { describe, expect, it } from "vitest";
import { partitionAttentionExceptions, type AcknowledgementRow } from "@/features/attention/hooks/useAttentionData";
import type { AttentionException } from "@/features/attention/types/exceptionTypes";

const now = "2026-11-25T12:00:00.000Z";
const exception = (orgId?: string, id = "shared", jobId = "job"): AttentionException => ({
  id, orgId, jobId, category: "evidence", severity: "high", title: "Missing evidence", detail: "Test", createdAt: now, actionLabel: "Review", actionRoute: "/",
});
const ack = (org_id: string | null, exception_id = "shared", snoozed_until: string | null = null, job_id = "job"): AcknowledgementRow => ({
  id: "ack", org_id, exception_id, job_id, snoozed_until, acknowledged_by: "admin", note: null, created_at: now,
});
describe("tenant-scoped exception partition", () => {
  it("does not hide another tenant or an unscoped alert", () => {
    const a = exception("A"), b = exception("B"), c = exception();
    const result = partitionAttentionExceptions([a,b,c], [ack("A"), ack(null)], now);
    expect(result.acknowledgedExceptions).toEqual([a]);
    expect(result.activeExceptions).toEqual([b,c]);
  });
  it("reactivates an expired snooze", () => {
    const a = exception("A");
    expect(partitionAttentionExceptions([a], [ack("A","shared","2026-11-25T11:00:00.000Z")], now).activeExceptions).toEqual([a]);
  });
  it("honours only matching job evidence IDs and organisations", () => {
    const a = exception("A"), b = exception("B");
    expect(partitionAttentionExceptions([a,b], [ack("A","evidence:wrong")], now).activeExceptions).toEqual([a,b]);
    expect(partitionAttentionExceptions([a,b], [ack("A","evidence:job")], now).acknowledgedExceptions).toEqual([a]);
  });
});
