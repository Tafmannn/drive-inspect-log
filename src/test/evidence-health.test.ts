import { describe, it, expect } from "vitest";
import { evaluateEvidenceHealth } from "@/lib/evidenceHealth";
import type { Inspection, Photo } from "@/lib/types";

const photo = (over: Partial<Photo>): Photo => ({
  id: over.id ?? "p-" + Math.random().toString(36).slice(2),
  job_id: "job-1",
  inspection_id: null,
  type: "pickup_exterior_front",
  url: "https://x/y.jpg",
  thumbnail_url: null,
  backend: "googleCloud",
  backend_ref: null,
  label: null,
  created_at: "2026-01-01T00:00:00Z",
  run_id: "R2",
  archived_at: null,
  ...over,
});

const inspection = (over: Partial<Inspection>): Inspection =>
  ({
    id: over.id ?? "i-" + Math.random().toString(36).slice(2),
    job_id: "job-1",
    type: "pickup",
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
    inspected_at: "2026-01-01T00:00:00Z",
    inspected_by_name: "Driver",
    customer_name: "Customer",
    driver_signature_url: "https://x/dsig.png",
    customer_signature_url: "https://x/csig.png",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as Inspection;

describe("evidenceHealth", () => {
  it("returns GREEN when pickup + delivery evidence is clean", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "p1", type: "pickup_exterior_front" }),
        photo({ id: "p2", type: "delivery_exterior_front" }),
      ],
      inspections: [
        inspection({ id: "i1", type: "pickup" }),
        inspection({ id: "i2", type: "delivery" }),
      ],
      pendingUploads: { failedCount: 0, blockedCount: 0 },
    });
    expect(r.level).toBe("green");
    expect(r.canUseForPod).toBe(true);
    expect(r.canCloseJob).toBe(true);
    expect(r.canInvoice).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("dedupes duplicate photos by identity", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "dup", type: "pickup_exterior_front" }),
        photo({ id: "dup", type: "pickup_exterior_front" }),
        photo({ id: "del", type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.photoSummary.totalRaw).toBe(3);
    expect(r.photoSummary.totalDeduped).toBe(2);
    expect(r.photoSummary.duplicateCount).toBe(1);
    expect(r.warnings.find((w) => w.code === "duplicate_photos_collapsed")).toBeTruthy();
  });

  it("excludes archived photos and reports archivedCount", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "a", type: "pickup_exterior_front", archived_at: "2026-01-02T00:00:00Z" }),
        photo({ id: "b", type: "pickup_exterior_front" }),
        photo({ id: "c", type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.photoSummary.archivedCount).toBe(1);
    expect(r.photoSummary.totalDeduped).toBe(2);
  });

  it("prefers current_run_id photos and excludes other runs", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "cur", run_id: "R2", type: "pickup_exterior_front" }),
        photo({ id: "old", run_id: "R1", type: "pickup_exterior_front" }),
        photo({ id: "del", run_id: "R2", type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.photoSummary.totalDeduped).toBe(2);
    expect(r.photoSummary.staleRunCount).toBe(1);
  });

  it("flags stale-run photos as CRITICAL", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "cur", run_id: "R2", type: "pickup_exterior_front" }),
        photo({ id: "stale", run_id: "R1", type: "pickup_exterior_front" }),
        photo({ id: "del", run_id: "R2", type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.level).toBe("critical");
    expect(r.canUseForPod).toBe(false);
    expect(r.canCloseJob).toBe(false);
    expect(r.canInvoice).toBe(false);
    expect(r.blockers.find((b) => b.code === "stale_run_evidence")).toBeTruthy();
  });

  it("uses null-run legacy photos only when no current-run photos exist (and warns)", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "legacy1", run_id: null, type: "pickup_exterior_front" }),
        photo({ id: "legacy2", run_id: null, type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.photoSummary.legacyCount).toBe(2);
    expect(r.photoSummary.totalDeduped).toBe(2);
    expect(r.warnings.find((w) => w.code === "legacy_null_run_photos")).toBeTruthy();
    // Amber, not red — legacy fallback is acceptable.
    expect(r.level).toBe("amber");
    expect(r.canUseForPod).toBe(true);
  });

  it("does NOT include legacy null-run photos when current-run photos exist", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "cur", run_id: "R2", type: "pickup_exterior_front" }),
        photo({ id: "legacy", run_id: null, type: "pickup_exterior_front" }),
        photo({ id: "del", run_id: "R2", type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    // legacy photo dropped; legacyCount is 0 because current run satisfied.
    expect(r.photoSummary.legacyCount).toBe(0);
    expect(r.photoSummary.totalDeduped).toBe(2);
  });

  it("flags missing image URL as a warning", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "p1", type: "pickup_exterior_front" }),
        photo({ id: "p2", type: "delivery_exterior_front", url: "" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.photoSummary.missingUrlCount).toBe(1);
    expect(r.warnings.find((w) => w.code === "missing_photo_url")).toBeTruthy();
    expect(r.level).toBe("amber");
  });

  it("blocks close/invoice when an upload has failed", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "p1", type: "pickup_exterior_front" }),
        photo({ id: "p2", type: "delivery_exterior_front" }),
      ],
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
      pendingUploads: { failedCount: 1 },
    });
    expect(r.level).toBe("red");
    expect(r.canCloseJob).toBe(false);
    expect(r.canInvoice).toBe(false);
    expect(r.canUseForPod).toBe(false);
    expect(r.blockers.find((b) => b.code === "failed_uploads")).toBeTruthy();
  });

  it("flags missing required signatures as RED", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "p1", type: "pickup_exterior_front" }),
        photo({ id: "p2", type: "delivery_exterior_front" }),
      ],
      inspections: [
        inspection({ type: "pickup" }),
        inspection({ type: "delivery", customer_signature_url: null }),
      ],
    });
    expect(r.level).toBe("red");
    expect(r.blockers.find((b) => b.code === "missing_customer_signature")).toBeTruthy();
  });

  it("flags missing required inspection as RED", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [photo({ id: "p1", type: "pickup_exterior_front" })],
      inspections: [inspection({ type: "pickup" })],
    });
    expect(r.level).toBe("red");
    expect(r.blockers.find((b) => b.code === "missing_delivery_inspection")).toBeTruthy();
    expect(r.blockers.find((b) => b.code === "missing_delivery_photos")).toBeTruthy();
  });

  it("treats huge duplicate counts as CRITICAL", () => {
    const dupes: Photo[] = [];
    for (let i = 0; i < 25; i++) {
      dupes.push(photo({ id: "same", type: "pickup_exterior_front" }));
    }
    dupes.push(photo({ id: "del", type: "delivery_exterior_front" }));
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: dupes,
      inspections: [inspection({ type: "pickup" }), inspection({ type: "delivery" })],
    });
    expect(r.level).toBe("critical");
    expect(r.blockers.find((b) => b.code === "duplicate_flood")).toBeTruthy();
  });

  it("evidence_mismatch when delivery inspection has stale run_id", () => {
    const r = evaluateEvidenceHealth({
      currentRunId: "R2",
      photos: [
        photo({ id: "p1", type: "pickup_exterior_front" }),
        photo({ id: "p2", type: "delivery_exterior_front" }),
      ],
      inspections: [
        inspection({ type: "pickup" }),
        // @ts-expect-error run_id may not be in the Inspection type yet
        inspection({ type: "delivery", run_id: "R1" }),
      ],
    });
    expect(r.level).toBe("critical");
    expect(r.blockers.find((b) => b.code === "evidence_mismatch")).toBeTruthy();
  });
});
