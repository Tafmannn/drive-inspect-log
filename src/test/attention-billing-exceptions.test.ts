import { describe, it, expect } from "vitest";
import {
  deriveBillingExceptions,
  type BillingJobRow,
} from "@/features/attention/engine/exceptionEngine";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function job(over: Partial<BillingJobRow> = {}): BillingJobRow {
  return {
    id: "job-1",
    org_id: "org-1",
    external_job_number: "AX-001",
    vehicle_reg: "AB12CDE",
    status: "completed",
    completed_at: daysAgo(5),
    total_price: 150,
    client_id: "client-1",
    ...over,
  };
}

const run = (jobs: BillingJobRow[], invoiced: string[] = []) =>
  deriveBillingExceptions(jobs, new Set(invoiced), undefined, NOW);

describe("deriveBillingExceptions", () => {
  it("flags a completed job with no price as high, routed to the job", () => {
    const [e] = run([job({ total_price: null })]);
    expect(e).toMatchObject({ category: "billing", severity: "high", title: "Completed job has no price", actionRoute: "/jobs/job-1" });
  });

  it("treats a zero price as no price", () => {
    expect(run([job({ total_price: 0 })])[0].title).toBe("Completed job has no price");
  });

  it("raises only the first blocker per job (price before client before invoice)", () => {
    const out = run([job({ total_price: null, client_id: null, completed_at: daysAgo(30) })]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Completed job has no price");
  });

  it("flags a priced job without a client as medium, routed to Link Jobs", () => {
    const [e] = run([job({ client_id: null })]);
    expect(e).toMatchObject({ severity: "medium", actionRoute: "/control/clients/link-jobs" });
  });

  it("does not nag about invoicing inside the grace period", () => {
    expect(run([job({ completed_at: daysAgo(1) })])).toHaveLength(0);
  });

  it("escalates uninvoiced work from medium to high with age", () => {
    expect(run([job({ completed_at: daysAgo(5) })])[0]).toMatchObject({ severity: "medium", actionRoute: "/control/invoice-prep" });
    expect(run([job({ completed_at: daysAgo(20) })])[0].severity).toBe("high");
  });

  it("raises nothing once the job is on an invoice", () => {
    expect(run([job({ completed_at: daysAgo(20) })], ["job-1"])).toHaveLength(0);
  });

  it("ignores non-terminal, hidden-by-lookback and undated jobs", () => {
    expect(run([
      job({ id: "a", status: "pod_ready", total_price: null }),
      job({ id: "b", completed_at: daysAgo(400), total_price: null }),
      job({ id: "c", completed_at: null, total_price: null }),
    ])).toHaveLength(0);
  });

  it("keeps a stable id as the day count changes, so acknowledgements stick", () => {
    const a = deriveBillingExceptions([job({ completed_at: "2026-11-01T10:00:00Z" })], new Set(), undefined, NOW)[0];
    const b = deriveBillingExceptions([job({ completed_at: "2026-11-01T10:00:00Z" })], new Set(), undefined, NOW + 3 * 86_400_000)[0];
    expect(a.detail).not.toBe(b.detail);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("billing:job-1:unbilled");
  });
});
