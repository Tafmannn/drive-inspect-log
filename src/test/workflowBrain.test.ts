import { describe, it, expect } from "vitest";
import { deriveWorkflowState } from "@/lib/workflowBrain";
import type { Job, Inspection, Photo } from "@/lib/types";

const RUN_A = "00000000-0000-0000-0000-00000000000a";
const RUN_B = "00000000-0000-0000-0000-00000000000b";

function mkJob(overrides: Partial<Job> & { current_run_id?: string | null } = {}): Job & { current_run_id?: string | null } {
  return {
    id: "job-1",
    external_job_number: "AX0001",
    sheet_job_id: null,
    job_date: null,
    priority: "Normal",
    job_type: "Single",
    job_source: null,
    client_name: null,
    client_notes: null,
    client_phone: null,
    client_email: null,
    client_company: null,
    vehicle_reg: "AB12CDE",
    vehicle_make: "Ford",
    vehicle_model: "Focus",
    vehicle_colour: "Blue",
    vehicle_year: null,
    vehicle_type: null,
    vehicle_fuel_type: null,
    pickup_contact_name: "P",
    pickup_contact_phone: "1",
    pickup_company: null,
    pickup_address_line1: "x",
    pickup_address_line2: null,
    pickup_city: "x",
    pickup_postcode: "x",
    pickup_notes: null,
    pickup_time_from: null,
    pickup_time_to: null,
    pickup_access_notes: null,
    delivery_contact_name: "D",
    delivery_contact_phone: "1",
    delivery_company: null,
    delivery_address_line1: "y",
    delivery_address_line2: null,
    delivery_city: "y",
    delivery_postcode: "y",
    delivery_notes: null,
    delivery_time_from: null,
    delivery_time_to: null,
    delivery_access_notes: null,
    promise_by_time: null,
    earliest_delivery_date: null,
    distance_miles: null,
    rate_per_mile: null,
    total_price: null,
    caz_ulez_flag: null,
    caz_ulez_cost: null,
    other_expenses: null,
    driver_id: "driver-1",
    driver_name: "Drv",
    driver_external_id: null,
    job_notes: null,
    cancellation_reason: null,
    sync_to_map: false,
    sheet_row_index: null,
    status: "ready_for_pickup",
    has_pickup_inspection: false,
    has_delivery_inspection: false,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    current_run_id: RUN_A,
    ...overrides,
  } as Job & { current_run_id?: string | null };
}

function mkInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "insp-1",
    job_id: "job-1",
    type: "delivery",
    odometer: 1000,
    fuel_level_percent: 50,
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
    inspected_at: "2026-01-02T00:00:00Z",
    inspected_by_name: "Drv",
    customer_name: "Cust",
    driver_signature_url: "https://example/d.png",
    customer_signature_url: "https://example/c.png",
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function mkPhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "photo-1",
    job_id: "job-1",
    inspection_id: "insp-1",
    type: "delivery_front",
    url: "https://example/p.jpg",
    thumbnail_url: null,
    backend: "googleCloud",
    backend_ref: "ref-1",
    label: null,
    created_at: "2026-01-02T00:00:00Z",
    run_id: RUN_A,
    archived_at: null,
    ...overrides,
  };
}

describe("workflowBrain", () => {
  it("awaiting_pickup phase + canStartPickup when ready and driver assigned", () => {
    const s = deriveWorkflowState({ job: mkJob() });
    expect(s.phase).toBe("awaiting_pickup");
    expect(s.readiness.canStartPickup).toBe(true);
    expect(s.nextAction?.label).toMatch(/Start pickup/i);
    expect(s.nextAction?.disabled).toBeFalsy();
  });

  it("blocks pickup when no driver assigned", () => {
    const s = deriveWorkflowState({ job: mkJob({ driver_id: null }) });
    expect(s.readiness.canStartPickup).toBe(false);
    expect(s.nextAction?.disabled).toBe(true);
    expect(s.nextAction?.label).toMatch(/driver/i);
  });

  it("active-job lock surfaces as blocker and disables next action", () => {
    const job = mkJob();
    const sibling: Job = mkJob({
      id: "job-2",
      external_job_number: "AX0002",
      status: "pickup_in_progress",
    });
    const s = deriveWorkflowState({ job, siblingJobs: [sibling, job] });
    expect(s.blockers.find((b) => b.code === "active_job_lock")).toBeTruthy();
    expect(s.readiness.canStartPickup).toBe(false);
    expect(s.nextAction?.disabled).toBe(true);
  });

  it("pod_ready: canGeneratePod when all evidence present on current run", () => {
    const job = mkJob({ status: "pod_ready", has_delivery_inspection: true });
    const s = deriveWorkflowState({
      job,
      inspections: [mkInspection()],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0, blockedCount: 0 },
    });
    expect(s.phase).toBe("pod_ready");
    expect(s.readiness.canGeneratePod).toBe(true);
    expect(s.readiness.canCloseJob).toBe(true);
    expect(s.nextAction?.label).toMatch(/Review POD/i);
    expect(s.evidence.deliveryPhotos).toHaveLength(1);
  });

  it("pod_ready: missing customer signature blocks POD", () => {
    const job = mkJob({ status: "pod_ready" });
    const s = deriveWorkflowState({
      job,
      inspections: [mkInspection({ customer_signature_url: null })],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0 },
    });
    expect(s.readiness.canGeneratePod).toBe(false);
    expect(s.blockers.find((b) => b.code === "missing_customer_signature")).toBeTruthy();
    expect(s.nextAction?.disabled).toBe(true);
  });

  it("pod_ready: blocked uploads gate POD", () => {
    const job = mkJob({ status: "pod_ready" });
    const s = deriveWorkflowState({
      job,
      inspections: [mkInspection()],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0, blockedCount: 2 },
    });
    expect(s.readiness.canGeneratePod).toBe(false);
    expect(s.blockers.find((b) => b.code === "blocked_uploads")).toBeTruthy();
  });

  it("delivery_complete also counts as canCloseJob (objective 7)", () => {
    const job = mkJob({ status: "delivery_complete" });
    const s = deriveWorkflowState({
      job,
      inspections: [mkInspection()],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0 },
    });
    expect(s.phase).toBe("pod_ready");
    expect(s.readiness.canCloseJob).toBe(true);
  });

  it("photos from a different run are excluded from evidence", () => {
    const job = mkJob({ status: "pod_ready" });
    const s = deriveWorkflowState({
      job,
      inspections: [mkInspection()],
      photos: [
        mkPhoto({ id: "old", run_id: RUN_B }),
        mkPhoto({ id: "new", run_id: RUN_A }),
      ],
      pendingUploads: { failedCount: 0 },
    });
    expect(s.evidence.deliveryPhotos.map((p) => p.id)).toEqual(["new"]);
  });

  it("legacy null-run photos surface only when no current-run photos exist", () => {
    const job = mkJob({ status: "pod_ready" });
    const s = deriveWorkflowState({
      job,
      inspections: [mkInspection()],
      photos: [mkPhoto({ id: "legacy", run_id: null })],
      pendingUploads: { failedCount: 0 },
    });
    expect(s.evidence.deliveryPhotos.map((p) => p.id)).toEqual(["legacy"]);
    expect(s.readiness.canGeneratePod).toBe(true);
  });

  it("stale-run delivery inspection is flagged", () => {
    const job = mkJob({ status: "pod_ready" });
    const insp = { ...mkInspection(), run_id: RUN_B } as any;
    const s = deriveWorkflowState({
      job,
      inspections: [insp],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0 },
    });
    expect(s.blockers.find((b) => b.code === "stale_run_evidence")).toBeTruthy();
    expect(s.readiness.canGeneratePod).toBe(false);
  });

  it("cancelled jobs return null nextAction", () => {
    const s = deriveWorkflowState({ job: mkJob({ status: "cancelled" }) });
    expect(s.phase).toBe("cancelled");
    expect(s.nextAction).toBeNull();
  });

  it("completed jobs route to POD view", () => {
    const s = deriveWorkflowState({ job: mkJob({ status: "completed" }) });
    expect(s.phase).toBe("completed");
    expect(s.nextAction?.label).toMatch(/View POD/i);
  });

  it("in_transit phase suggests starting delivery inspection", () => {
    const s = deriveWorkflowState({ job: mkJob({ status: "in_transit" }) });
    expect(s.phase).toBe("in_transit");
    expect(s.readiness.canStartDelivery).toBe(true);
    expect(s.nextAction?.label).toMatch(/Start delivery/i);
  });

  it("does not surface POD blockers in early phases (noise reduction)", () => {
    const s = deriveWorkflowState({ job: mkJob() });
    expect(s.blockers.find((b) => b.code === "missing_delivery_photos")).toBeUndefined();
  });
});
