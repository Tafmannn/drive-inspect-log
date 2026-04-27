import { describe, it, expect } from "vitest";
import { getWorkflowBrain, type BrainJobLike } from "@/lib/workflowBrain";
import type { Inspection, Photo, Job } from "@/lib/types";

const RUN = "00000000-0000-0000-0000-00000000000a";

function mkJob(overrides: Partial<BrainJobLike> = {}): BrainJobLike {
  return {
    id: "job-1",
    status: "ready_for_pickup",
    driver_id: "driver-1",
    current_run_id: RUN,
    has_pickup_inspection: false,
    has_delivery_inspection: false,
    pod_pdf_url: null,
    total_price: null,
    admin_rate: null,
    client_id: null,
    client_name: null,
    external_job_number: "AX0001",
    ...overrides,
  };
}

function mkInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "i-1",
    job_id: "job-1",
    type: "delivery",
    odometer: 1000,
    fuel_level_percent: 50,
    vehicle_condition: null,
    light_condition: null,
    oil_level_status: null,
    water_level_status: null,
    notes: null,
    handbook: null, service_book: null, mot: null, v5: null,
    parcel_shelf: null, spare_wheel_status: null, tool_kit: null,
    tyre_inflation_kit: null, locking_wheel_nut: null, sat_nav_working: null,
    alloys_or_trims: null, alloys_damaged: null, wheel_trims_damaged: null,
    number_of_keys: null, ev_charging_cables: null, aerial: null,
    customer_paperwork: null,
    has_damage: false,
    inspected_at: "2026-01-02T00:00:00Z",
    inspected_by_name: "Drv",
    customer_name: "Cust",
    driver_signature_url: "https://x/d.png",
    customer_signature_url: "https://x/c.png",
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function mkPhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "p-1",
    job_id: "job-1",
    inspection_id: "i-1",
    type: "delivery_front",
    url: "https://x/p.jpg",
    thumbnail_url: null,
    backend: "googleCloud",
    backend_ref: "ref-1",
    label: null,
    created_at: "2026-01-02T00:00:00Z",
    run_id: RUN,
    archived_at: null,
    ...overrides,
  };
}

describe("getWorkflowBrain — Stage 1 spec scenarios", () => {
  it("assigned job → driverNextAction = start pickup", () => {
    const b = getWorkflowBrain({ job: mkJob({ status: "assigned" }) });
    expect(b.phase).toBe("awaiting_pickup");
    expect(b.driverNextAction?.code).toBe("start_pickup");
    expect(b.driverNextAction?.label).toMatch(/start pickup/i);
    expect(b.invoiceReadiness.ready).toBe(false);
  });

  it("pickup_complete (in transit) → driverNextAction = start delivery", () => {
    const b = getWorkflowBrain({ job: mkJob({ status: "pickup_complete" }) });
    expect(b.phase).toBe("in_transit");
    expect(b.driverNextAction?.code).toBe("start_delivery");
    expect(b.driverNextAction?.label).toMatch(/start delivery/i);
  });

  it("delivery_complete → adminNextAction = review POD; NOT completed", () => {
    const b = getWorkflowBrain({ job: mkJob({ status: "delivery_complete" }) });
    expect(b.phase).toBe("pod_ready");
    expect(b.adminNextAction?.code).toBe("review_pod");
    expect(b.driverNextAction).toBeNull();
    expect(b.invoiceReadiness.ready).toBe(false);
    // Hard rule: delivery_complete is not completed.
    expect(b.invoiceReadiness.blockers.join(" ")).toMatch(/before invoicing/i);
  });

  it("pod_ready → adminNextAction = review POD; NOT invoice-ready", () => {
    const b = getWorkflowBrain({
      job: mkJob({
        status: "pod_ready",
        total_price: 250,
        client_name: "Acme",
      }),
    });
    expect(b.adminNextAction?.code).toBe("review_pod");
    expect(b.invoiceReadiness.ready).toBe(false);
    expect(b.debug.invoiceBlockerCodes).toContain("not_completed");
  });

  it("completed + price + client + approved POD → invoice-ready", () => {
    const b = getWorkflowBrain({
      job: mkJob({
        status: "completed",
        total_price: 300,
        client_name: "Acme",
      }),
      podApproved: true,
    });
    expect(b.invoiceReadiness.ready).toBe(true);
    expect(b.adminNextAction?.code).toBe("raise_invoice");
  });

  it("completed without price → invoice blocked", () => {
    const b = getWorkflowBrain({
      job: mkJob({
        status: "completed",
        total_price: null,
        admin_rate: null,
        client_name: "Acme",
      }),
      podApproved: true,
    });
    expect(b.invoiceReadiness.ready).toBe(false);
    expect(b.debug.invoiceBlockerCodes).toContain("missing_price");
    expect(b.warnings.some((w) => /no price set/i.test(w))).toBe(true);
  });

  it("completed without client → invoice blocked", () => {
    const b = getWorkflowBrain({
      job: mkJob({
        status: "completed",
        total_price: 300,
        client_id: null,
        client_name: null,
      }),
      podApproved: true,
    });
    expect(b.invoiceReadiness.ready).toBe(false);
    expect(b.debug.invoiceBlockerCodes).toContain("missing_client");
  });

  it("cancelled → no driver action, no admin action, no invoice", () => {
    const b = getWorkflowBrain({ job: mkJob({ status: "cancelled" }) });
    expect(b.phase).toBe("cancelled");
    expect(b.driverNextAction).toBeNull();
    expect(b.adminNextAction).toBeNull();
    expect(b.invoiceReadiness.ready).toBe(false);
  });

  it("unknown status → warning, not crash; phase = unknown", () => {
    const b = getWorkflowBrain({
      job: mkJob({ status: "totally_made_up_status" }),
    });
    expect(b.phase).toBe("unknown");
    expect(b.warnings.length).toBeGreaterThan(0);
    expect(b.warnings[0]).toMatch(/unknown job status/i);
    expect(b.driverNextAction).toBeNull();
    expect(b.adminNextAction?.code).toBe("investigate");
    expect(b.invoiceReadiness.ready).toBe(false);
    expect(b.podReadiness.ready).toBe(false);
    expect(b.debug.statusKnown).toBe(false);
  });

  it("active-job lock surfaces as blocker + high risk", () => {
    const job = mkJob({ status: "ready_for_pickup" }) as BrainJobLike;
    const sibling = {
      id: "job-2",
      status: "pickup_in_progress",
      driver_id: "driver-1",
      external_job_number: "AX0099",
    } as unknown as Job;
    const b = getWorkflowBrain({
      job,
      siblingJobs: [sibling, job as unknown as Job],
    });
    expect(b.blockers.length).toBeGreaterThan(0);
    expect(b.riskLevel).toBe("high");
    expect(b.driverNextAction?.disabled).toBe(true);
  });

  it("pod_ready with full evidence → podReadiness ready", () => {
    const b = getWorkflowBrain({
      job: mkJob({ status: "pod_ready", has_delivery_inspection: true }),
      inspections: [mkInspection()],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0, blockedCount: 0 },
    });
    expect(b.podReadiness.ready).toBe(true);
    expect(b.invoiceReadiness.ready).toBe(false); // still not completed
  });

  it("blocked uploads → riskLevel medium and POD blocked", () => {
    const b = getWorkflowBrain({
      job: mkJob({ status: "delivery_complete" }),
      inspections: [mkInspection()],
      photos: [mkPhoto()],
      pendingUploads: { failedCount: 0, blockedCount: 2 },
    });
    expect(b.riskLevel).toBe("medium");
    expect(b.podReadiness.ready).toBe(false);
    expect(b.debug.podBlockerCodes).toContain("blocked_uploads");
  });
});
