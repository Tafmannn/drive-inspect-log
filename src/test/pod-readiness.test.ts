// NOTE: Math.random() in this test file generates fixture IDs only — non-security, never reaches production code.
import { describe, it, expect } from "vitest";
import { evaluatePodReadiness } from "@/lib/podReadiness";
import type { Photo, Inspection } from "@/lib/types";

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

const insp = (over: Partial<Inspection> & { type: "pickup" | "delivery" }): Inspection => ({
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
} as Inspection);

const cleanInputs = () => ({
  currentRunId: RUN,
  photos: [
    ph({ id: "p1", type: "pickup_exterior_front" }),
    ph({ id: "p2", type: "delivery_exterior_front" }),
  ],
  inspections: [insp({ type: "pickup" }), insp({ type: "delivery" })],
});

describe("podReadiness — Stage 4 gating", () => {
  it("POD ready with clean evidence", () => {
    const r = evaluatePodReadiness(cleanInputs());
    expect(r.podReady).toBe(true);
    expect(r.safeToApprove).toBe(true);
    expect(r.safeToCloseJob).toBe(true);
    expect(r.health.level).toBe("green");
    expect(r.blockers).toEqual([]);
    expect(r.missingSections).toEqual([]);
  });

  it("POD not ready without pickup inspection", () => {
    const i = cleanInputs();
    i.inspections = i.inspections.filter((x) => x.type !== "pickup");
    const r = evaluatePodReadiness(i);
    expect(r.podReady).toBe(false);
    expect(r.safeToApprove).toBe(false);
    expect(r.missingSections).toContain("Pickup inspection");
    expect(r.blockers.find((b) => b.code === "missing_pickup_inspection")).toBeTruthy();
  });

  it("POD not ready without delivery inspection", () => {
    const i = cleanInputs();
    i.inspections = i.inspections.filter((x) => x.type !== "delivery");
    const r = evaluatePodReadiness(i);
    expect(r.podReady).toBe(false);
    expect(r.safeToApprove).toBe(false);
    expect(r.missingSections).toContain("Delivery inspection");
    expect(r.blockers.find((b) => b.code === "missing_delivery_inspection")).toBeTruthy();
  });

  it("POD not ready when delivery driver signature missing", () => {
    const i = cleanInputs();
    i.inspections = i.inspections.map((x) =>
      x.type === "delivery" ? { ...x, driver_signature_url: null } : x,
    );
    const r = evaluatePodReadiness(i);
    expect(r.podReady).toBe(false);
    expect(r.missingSections).toContain("Driver signature");
  });

  it("POD not ready with failed uploads", () => {
    const r = evaluatePodReadiness({
      ...cleanInputs(),
      pendingUploads: { failedCount: 2 },
    });
    expect(r.podReady).toBe(false);
    expect(r.safeToApprove).toBe(false);
    expect(r.safeToCloseJob).toBe(false);
    expect(r.blockers.find((b) => b.code === "failed_uploads")).toBeTruthy();
  });

  it("POD not ready with stale-run evidence (critical)", () => {
    const i = cleanInputs();
    i.photos = [
      ph({ id: "p1", type: "pickup_exterior_front" }),
      ph({ id: "p2", type: "delivery_exterior_front" }),
      // Photo from a prior run — must escalate to critical and block.
      ph({ id: "stale", type: "delivery_exterior_rear", run_id: "run-old" }),
    ];
    const r = evaluatePodReadiness(i);
    expect(r.health.level).toBe("critical");
    expect(r.podReady).toBe(false);
    expect(r.safeToApprove).toBe(false);
    expect(r.safeToCloseJob).toBe(false);
    expect(r.blockers.find((b) => b.code === "stale_run_evidence")).toBeTruthy();
  });

  it("POD not ready when delivery photos missing", () => {
    const i = cleanInputs();
    i.photos = [ph({ id: "p1", type: "pickup_exterior_front" })];
    const r = evaluatePodReadiness(i);
    expect(r.podReady).toBe(false);
    expect(r.missingSections).toContain("Delivery photos");
  });

  it("delivery-only override allows POD without pickup", () => {
    const r = evaluatePodReadiness({
      currentRunId: RUN,
      photos: [ph({ id: "p2", type: "delivery_exterior_front" })],
      inspections: [insp({ type: "delivery" })],
      requirePickupInspection: false,
    });
    expect(r.podReady).toBe(true);
    expect(r.safeToApprove).toBe(true);
  });

  it("approval is purely advisory — does NOT auto-invoice or auto-complete", () => {
    // The function must remain pure: same inputs → same outputs, no flags
    // that imply an automatic invoicing or completion side-effect.
    const r1 = evaluatePodReadiness(cleanInputs());
    const r2 = evaluatePodReadiness(cleanInputs());
    expect(r1).toEqual(r2);
    // No invoice-trigger field exists on the result by design.
    expect((r1 as any).autoInvoice).toBeUndefined();
    expect((r1 as any).autoComplete).toBeUndefined();
  });

  it("POD approval can unlock completion when all conditions are met", () => {
    const r = evaluatePodReadiness(cleanInputs());
    expect(r.safeToApprove && r.safeToCloseJob).toBe(true);
  });

  it("amber (warnings only) still permits approval and closure", () => {
    // Add legacy null-run photo via fallback path: zero current-run + 1 legacy.
    const r = evaluatePodReadiness({
      currentRunId: RUN,
      photos: [
        ph({ id: "p1", type: "pickup_exterior_front", run_id: null }),
        ph({ id: "p2", type: "delivery_exterior_front", run_id: null }),
      ],
      inspections: [insp({ type: "pickup" }), insp({ type: "delivery" })],
    });
    // legacy fallback used → amber warning, still safe.
    expect(["green", "amber"]).toContain(r.health.level);
    expect(r.safeToApprove).toBe(true);
  });
});
