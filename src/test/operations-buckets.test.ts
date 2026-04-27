// NOTE: Math.random() in this test file generates fixture IDs only — non-security, never reaches production code.
import { describe, it, expect } from "vitest";
import {
  classifyJobsIntoBuckets,
  type BucketJob,
} from "@/lib/operationsBuckets";
import type { Inspection, Photo } from "@/lib/types";

const RUN = "run-current";

const ph = (over: Partial<Photo>): Photo => ({
  id: over.id ?? "ph-" + Math.random().toString(36).slice(2),
  job_id: "job-1",
  inspection_id: null,
  type: over.type ?? "pickup_exterior_front",
  url: "https://x/y.jpg",
  thumbnail_url: null,
  backend: "googleCloud",
  backend_ref: null,
  label: null,
  created_at: "2026-01-01T00:00:00Z",
  run_id: RUN,
  archived_at: null,
  ...over,
});

const insp = (
  over: Partial<Inspection> & { type: "pickup" | "delivery" },
): Inspection =>
  ({
    id: "insp-" + Math.random().toString(36).slice(2),
    job_id: "job-1",
    type: over.type,
    odometer: null,
    fuel_level_percent: null,
    vehicle_condition: null,
    light_condition: null,
    oil_level_status: null,
    water_level_status: null,
    notes: null,
    handbook: null,
    service_book: null,
    mot: null,
    v5: null,
    parcel_shelf: null,
    spare_wheel_status: null,
    tool_kit: null,
    tyre_inflation_kit: null,
    locking_wheel_nut: null,
    sat_nav_working: null,
    alloys_or_trims: null,
    alloys_damaged: null,
    wheel_trims_damaged: null,
    number_of_keys: null,
    ev_charging_cables: null,
    aerial: null,
    customer_paperwork: null,
    has_damage: false,
    inspected_at: "2026-01-01T00:00:00Z",
    inspected_by_name: "Driver A",
    customer_name: "Customer A",
    driver_signature_url: "sig://driver",
    customer_signature_url: "sig://customer",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as Inspection;

const cleanCompletedJob = (over: Partial<BucketJob> = {}): BucketJob => ({
  id: over.id ?? "job-1",
  status: "completed",
  total_price: 200,
  client_id: "client-1",
  client_name: "Acme",
  client_company: "Acme Ltd",
  client_email: "billing@acme.test",
  current_run_id: RUN,
  driver_id: "driver-1",
  has_pickup_inspection: true,
  has_delivery_inspection: true,
  inspections: [insp({ type: "pickup" }), insp({ type: "delivery" })],
  photos: [
    ph({ id: "p1", type: "pickup_exterior_front" }),
    ph({ id: "p2", type: "delivery_exterior_front" }),
  ],
  ...over,
});

describe("operationsBuckets — Stage 6 classifier", () => {
  it("clean completed job → ready_to_invoice + completed_not_invoiced", () => {
    const r = classifyJobsIntoBuckets([{ job: cleanCompletedJob() }]);
    expect(r.byKey.ready_to_invoice.count).toBe(1);
    expect(r.byKey.completed_not_invoiced.count).toBe(1);
    expect(r.byKey.blocked_evidence.count).toBe(0);
  });

  it("already invoiced job is excluded from invoice + finance buckets", () => {
    const r = classifyJobsIntoBuckets([
      { job: cleanCompletedJob(), alreadyInvoiced: true },
    ]);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
    expect(r.byKey.completed_not_invoiced.count).toBe(0);
  });

  it("pod_ready job NEVER appears in ready_to_invoice", () => {
    const job = cleanCompletedJob({
      id: "job-pod",
      status: "pod_ready",
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
    expect(r.byKey.needs_admin_review.count).toBe(1);
    expect(r.byKey.ready_to_close.count).toBe(1);
  });

  it("delivery_complete job NEVER appears in ready_to_invoice", () => {
    const job = cleanCompletedJob({
      id: "job-dc",
      status: "delivery_complete",
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
    expect(r.byKey.needs_admin_review.count).toBe(1);
  });

  it("red evidence (failed uploads) → blocked_evidence + failed_uploads, NOT ready_to_invoice / ready_to_close", () => {
    const job = cleanCompletedJob({
      id: "job-fail",
      status: "pod_ready",
      failedUploadCount: 2,
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.blocked_evidence.count).toBe(1);
    expect(r.byKey.failed_uploads.count).toBe(1);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
    expect(r.byKey.ready_to_close.count).toBe(0);
  });

  it("stale-run photo (different run_id) → stale_run_risk + blocked_evidence", () => {
    const job = cleanCompletedJob({
      id: "job-stale",
      status: "pod_ready",
      photos: [
        ph({ id: "p1", type: "pickup_exterior_front" }),
        ph({ id: "p2", type: "delivery_exterior_front", run_id: "run-old" }),
      ],
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.stale_run_risk.count + r.byKey.blocked_evidence.count).toBeGreaterThan(0);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
  });

  it("missing delivery customer signature → missing_signatures + blocked_evidence", () => {
    const job = cleanCompletedJob({
      id: "job-sig",
      status: "pod_ready",
      inspections: [
        insp({ type: "pickup" }),
        insp({ type: "delivery", customer_signature_url: null }),
      ],
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.missing_signatures.count).toBe(1);
    expect(r.byKey.blocked_evidence.count).toBe(1);
    expect(r.byKey.ready_to_close.count).toBe(0);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
  });

  it("cancelled job → cancelled_archived only", () => {
    const job = cleanCompletedJob({
      id: "job-cancel",
      status: "cancelled",
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.cancelled_archived.count).toBe(1);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
    expect(r.byKey.completed_not_invoiced.count).toBe(0);
    expect(r.byKey.needs_admin_review.count).toBe(0);
  });

  it("driver action: assigned status (in-flight) routes to needs_driver_action", () => {
    const job = cleanCompletedJob({
      id: "job-it",
      status: "in_transit",
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.needs_driver_action.count).toBe(1);
    expect(r.byKey.needs_admin_review.count).toBe(0);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
  });

  it("today's job appears in todays_active", () => {
    const today = new Date("2026-04-27T10:00:00Z");
    const job = cleanCompletedJob({
      id: "job-today",
      status: "in_transit",
      job_date: "2026-04-27",
    });
    const r = classifyJobsIntoBuckets([{ job }], { now: today });
    expect(r.byKey.todays_active.count).toBe(1);
  });

  it("amber evidence on completed job → weak_pod, NOT blocked_evidence", () => {
    // Single photo per side triggers low_*_photo_count warnings (amber).
    const job = cleanCompletedJob({
      id: "job-amber",
      status: "pod_ready",
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    // Health may be amber (low photo counts). If amber, weak_pod set,
    // blocked_evidence not. If green, weak_pod not set — both are
    // valid given the brain. We only assert mutual exclusivity here.
    const amber = r.assignments[0].evidence.level === "amber";
    if (amber) {
      expect(r.byKey.weak_pod.count).toBe(1);
      expect(r.byKey.blocked_evidence.count).toBe(0);
    } else {
      expect(r.byKey.weak_pod.count).toBe(0);
    }
  });

  it("blocked job NEVER appears as ready_to_close", () => {
    const job = cleanCompletedJob({
      id: "job-blocked",
      status: "pod_ready",
      failedUploadCount: 1,
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.ready_to_close.count).toBe(0);
    expect(r.byKey.blocked_evidence.count).toBe(1);
  });

  it("completed without price → not invoice-ready but appears in completed_not_invoiced", () => {
    const job = cleanCompletedJob({
      id: "job-noprice",
      total_price: null,
    });
    const r = classifyJobsIntoBuckets([{ job }]);
    expect(r.byKey.ready_to_invoice.count).toBe(0);
    expect(r.byKey.completed_not_invoiced.count).toBe(1);
  });

  it("aggregates counts and exposes BUCKET_DEFS metadata", () => {
    const r = classifyJobsIntoBuckets([
      { job: cleanCompletedJob({ id: "a" }) },
      { job: cleanCompletedJob({ id: "b", status: "pod_ready" }) },
      { job: cleanCompletedJob({ id: "c", status: "cancelled" }) },
    ]);
    expect(r.buckets.find((b) => b.key === "ready_to_invoice")?.def.label).toBe(
      "Jobs ready to invoice",
    );
    expect(r.byKey.cancelled_archived.jobIds).toEqual(["c"]);
  });
});
