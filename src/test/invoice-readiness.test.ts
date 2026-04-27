// NOTE: Math.random() in this test file generates fixture IDs only — non-security, never reaches production code.
import { describe, it, expect } from "vitest";
import {
  evaluateInvoiceReadiness,
  filterInvoiceReadyJobs,
  type InvoiceReadinessJob,
} from "@/lib/invoiceReadiness";
import type { Inspection, Photo } from "@/lib/types";

const RUN = "run-A";

const ph = (over: Partial<Photo>): Photo => ({
  id: "ph-" + Math.random().toString(36).slice(2),
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

const insp = (type: "pickup" | "delivery"): Inspection =>
  ({
    id: "i-" + type,
    job_id: "job-1",
    type,
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
    inspected_by_name: "Driver",
    customer_name: "Customer",
    driver_signature_url: "sig://d",
    customer_signature_url: "sig://c",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }) as Inspection;

const cleanJob = (over: Partial<InvoiceReadinessJob> = {}): InvoiceReadinessJob => ({
  id: "job-1",
  status: "completed",
  total_price: 250,
  client_id: "client-1",
  client_name: "Acme Logistics",
  client_company: "Acme Ltd",
  client_email: "billing@acme.test",
  client_phone: "+44 7000 000000",
  current_run_id: RUN,
  inspections: [insp("pickup"), insp("delivery")],
  photos: [
    ph({ type: "pickup_exterior_front" }),
    ph({ type: "delivery_exterior_front" }),
  ],
  ...over,
});

describe("invoiceReadiness — Stage 5 strict gating", () => {
  it("completed + clean POD + price + client = ready", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob(),
      alreadyInvoiced: false,
      receiptCount: 1,
    });
    expect(r.ready).toBe(true);
    expect(r.primaryReason).toBe("Ready to invoice");
    expect(r.blockers).toEqual([]);
  });

  it("pod_ready is NOT invoice-ready", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({ status: "pod_ready" }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.find((b) => b.code === "pod_not_reviewed")).toBeTruthy();
    expect(r.primaryReason).toMatch(/POD not reviewed/);
  });

  it("delivery_complete is NOT invoice-ready", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({ status: "delivery_complete" }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.find((b) => b.code === "wrong_status")).toBeTruthy();
  });

  it.each([
    "draft",
    "ready_for_pickup",
    "assigned",
    "pickup_complete",
    "in_transit",
    "delivery_in_progress",
    "awaiting_review",
    "cancelled",
  ])("status %s is NOT invoice-ready", (status) => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({ status }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
  });

  it("completed without price = blocked", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({ total_price: null }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.find((b) => b.code === "missing_price")).toBeTruthy();
  });

  it("zero or negative price is blocked", () => {
    expect(
      evaluateInvoiceReadiness({
        job: cleanJob({ total_price: 0 }),
        alreadyInvoiced: false,
      }).blockers.find((b) => b.code === "missing_price"),
    ).toBeTruthy();
    expect(
      evaluateInvoiceReadiness({
        job: cleanJob({ total_price: -10 }),
        alreadyInvoiced: false,
      }).blockers.find((b) => b.code === "missing_price"),
    ).toBeTruthy();
  });

  it("completed without client = blocked", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({
        client_id: null,
        client_name: null,
        client_company: null,
        client_email: null,
        client_phone: null,
      }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.find((b) => b.code === "missing_client")).toBeTruthy();
  });

  it("legacy unlinked job with name but no contact = blocked", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({
        client_id: null,
        client_email: null,
        client_phone: null,
      }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(
      r.blockers.find((b) => b.code === "missing_billing_contact"),
    ).toBeTruthy();
  });

  it("completed with red evidence = blocked", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({
        // strip delivery inspection → red blocker on evidence health
        inspections: [insp("pickup")],
      }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(
      r.blockers.find((b) => b.code === "evidence_red_or_critical"),
    ).toBeTruthy();
  });

  it("completed with critical evidence (stale run) = blocked", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({
        photos: [
          ph({ type: "pickup_exterior_front" }),
          ph({ type: "delivery_exterior_front" }),
          ph({ type: "delivery_exterior_rear", run_id: "run-OLD" }),
        ],
      }),
      alreadyInvoiced: false,
    });
    expect(r.ready).toBe(false);
    expect(r.evidenceLevel).toBe("critical");
  });

  it("already invoiced job does not duplicate", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob(),
      alreadyInvoiced: true,
    });
    expect(r.ready).toBe(false);
    expect(r.alreadyInvoiced).toBe(true);
    expect(r.blockers.find((b) => b.code === "already_invoiced")).toBeTruthy();
    expect(r.primaryReason).toBe("Already invoiced");
  });

  it("amber evidence is allowed but warned", () => {
    // Legacy null-run photos used as fallback → amber, not red.
    const r = evaluateInvoiceReadiness({
      job: cleanJob({
        photos: [
          ph({ type: "pickup_exterior_front", run_id: null }),
          ph({ type: "delivery_exterior_front", run_id: null }),
        ],
      }),
      alreadyInvoiced: false,
      receiptCount: 1,
    });
    expect(r.evidenceLevel).toBe("amber");
    expect(r.ready).toBe(true);
    expect(r.warnings.find((w) => w.code === "evidence_amber")).toBeTruthy();
  });

  it("missing billing email is a warning, not a blocker, when phone is present", () => {
    const r = evaluateInvoiceReadiness({
      job: cleanJob({ client_email: null }),
      alreadyInvoiced: false,
      receiptCount: 1,
    });
    expect(r.ready).toBe(true);
    expect(r.warnings.find((w) => w.code === "no_billing_email")).toBeTruthy();
  });

  it("filterInvoiceReadyJobs returns only ready jobs", () => {
    const ready = filterInvoiceReadyJobs([
      { job: cleanJob({ id: "a" }), alreadyInvoiced: false, receiptCount: 1 },
      { job: cleanJob({ id: "b", status: "pod_ready" }), alreadyInvoiced: false },
      { job: cleanJob({ id: "c", total_price: 0 }), alreadyInvoiced: false },
      { job: cleanJob({ id: "d" }), alreadyInvoiced: true },
    ]);
    expect(ready.map((j) => j.id)).toEqual(["a"]);
  });
});
