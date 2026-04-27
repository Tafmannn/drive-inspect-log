/**
 * mutationEvents — verifies the centralised admin invalidation helper
 * busts every dashboard query key in one call. If a new admin query is
 * added without being registered in ADMIN_OPERATIONAL_KEYS, this test
 * fails — protecting against the "success toast but stale dashboard"
 * regression.
 */
import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateAdminOperationalQueues,
  invalidateForEvent,
} from "@/lib/mutationEvents";

const REQUIRED_ADMIN_KEYS: string[][] = [
  ["jobs", "admin", "queues"],
  ["jobs", "admin", "queue-kpis"],
  ["admin-operations-buckets"],
  ["admin-missing-evidence-count"],
  ["admin-compliance-counts"],
  ["admin-pod-review"],
  ["closure-review-queue"],
  ["closure-review-kpis"],
  ["attention-center"],
  ["invoice-prep-eligible"],
];

function trackInvalidations(qc: QueryClient): string[] {
  const calls: string[] = [];
  const orig = qc.invalidateQueries.bind(qc);
  vi.spyOn(qc, "invalidateQueries").mockImplementation((arg: any) => {
    calls.push(JSON.stringify(arg?.queryKey ?? arg));
    return orig(arg);
  });
  return calls;
}

describe("invalidateAdminOperationalQueues", () => {
  it("invalidates every admin dashboard surface", () => {
    const qc = new QueryClient();
    const calls = trackInvalidations(qc);
    invalidateAdminOperationalQueues(qc);
    for (const key of REQUIRED_ADMIN_KEYS) {
      expect(calls).toContain(JSON.stringify(key));
    }
  });

  it("also invalidates per-job derived caches when jobId is given", () => {
    const qc = new QueryClient();
    const calls = trackInvalidations(qc);
    invalidateAdminOperationalQueues(qc, "job-123");
    expect(calls).toContain(JSON.stringify(["job", "job-123"]));
    expect(calls).toContain(JSON.stringify(["jobs", "detail", "job-123"]));
    expect(calls).toContain(JSON.stringify(["evidence-health", "job-123"]));
    expect(calls).toContain(JSON.stringify(["pod-readiness", "job-123"]));
    expect(calls).toContain(JSON.stringify(["invoice-readiness", "job-123"]));
  });
});

describe("invalidateForEvent", () => {
  it.each([
    "pod_approved",
    "evidence_resolved",
    "evidence_override_applied",
    "job_status_changed",
    "inspection_submitted",
    "driver_assignment_changed",
  ] as const)("event %s busts every admin dashboard surface", (event) => {
    const qc = new QueryClient();
    const calls = trackInvalidations(qc);
    invalidateForEvent(qc, event);
    for (const key of REQUIRED_ADMIN_KEYS) {
      expect(calls).toContain(JSON.stringify(key));
    }
  });

  it("invoice_created busts invoicing + admin queues", () => {
    const qc = new QueryClient();
    const calls = trackInvalidations(qc);
    invalidateForEvent(qc, "invoice_created");
    expect(calls).toContain(JSON.stringify(["invoice-prep-eligible"]));
    expect(calls).toContain(JSON.stringify(["jobs", "admin", "queues"]));
    expect(calls).toContain(JSON.stringify(["admin-operations-buckets"]));
  });

  it("appends extraKeys to invalidation set", () => {
    const qc = new QueryClient();
    const calls = trackInvalidations(qc);
    invalidateForEvent(qc, "pod_approved", [["job", "abc"]]);
    expect(calls).toContain(JSON.stringify(["job", "abc"]));
  });
});
