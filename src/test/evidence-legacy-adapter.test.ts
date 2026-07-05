import { describe, it, expect } from "vitest";
import {
  parseLegacyType,
  toLegacyType,
  legacyPhotoToView,
} from "@/lib/evidence/legacyAdapter";
import type { Photo } from "@/lib/types";

describe("legacyAdapter — parseLegacyType", () => {
  it("maps every canonical standard photo type to (stage, category)", () => {
    expect(parseLegacyType("pickup_exterior_front")).toEqual({ stage: "pickup", category: "front" });
    expect(parseLegacyType("pickup_exterior_rear")).toEqual({ stage: "pickup", category: "rear" });
    expect(parseLegacyType("pickup_exterior_driver_side")).toEqual({ stage: "pickup", category: "offside" });
    expect(parseLegacyType("pickup_exterior_passenger_side")).toEqual({ stage: "pickup", category: "nearside" });
    expect(parseLegacyType("pickup_interior")).toEqual({ stage: "pickup", category: "interior" });
    expect(parseLegacyType("pickup_dashboard")).toEqual({ stage: "pickup", category: "dashboard" });
    expect(parseLegacyType("pickup_fuel_gauge")).toEqual({ stage: "pickup", category: "fuel" });
    expect(parseLegacyType("delivery_exterior_front")).toEqual({ stage: "delivery", category: "front" });
    expect(parseLegacyType("delivery_other")).toEqual({ stage: "delivery", category: "additional" });
  });

  it("maps damage close-ups to category=damage with stage unknown", () => {
    expect(parseLegacyType("damage_close_up")).toEqual({ stage: null, category: "damage" });
  });

  it("returns nulls for empty/unknown rather than guessing", () => {
    expect(parseLegacyType("")).toEqual({ stage: null, category: null });
    expect(parseLegacyType(null)).toEqual({ stage: null, category: null });
    expect(parseLegacyType("pickup_wat")).toEqual({ stage: "pickup", category: null });
  });
});

describe("legacyAdapter — toLegacyType (reverse) round-trips", () => {
  it("round-trips standard categories back to canonical type strings", () => {
    const cases: Array<[string]> = [
      ["pickup_exterior_front"],
      ["pickup_exterior_rear"],
      ["pickup_exterior_driver_side"],
      ["pickup_exterior_passenger_side"],
      ["pickup_interior"],
      ["pickup_dashboard"],
      ["pickup_fuel_gauge"],
      ["delivery_other"],
    ];
    for (const [type] of cases) {
      const { stage, category } = parseLegacyType(type);
      expect(toLegacyType(stage!, category!)).toBe(type);
    }
  });

  it("maps damage to the unprefixed legacy type", () => {
    expect(toLegacyType("pickup", "damage")).toBe("damage_close_up");
    expect(toLegacyType("delivery", "damage")).toBe("damage_close_up");
  });

  it("never silently drops a category with no legacy suffix", () => {
    expect(toLegacyType("pickup", "vin")).toBe("pickup_vin");
    expect(toLegacyType("delivery", "document")).toBe("delivery_document");
  });
});

describe("legacyAdapter — legacyPhotoToView", () => {
  it("projects a legacy photo row into a unified view", () => {
    const photo = {
      id: "p1",
      job_id: "job-1",
      inspection_id: "i1",
      type: "delivery_exterior_rear",
      url: "https://x/object/public/vehicle-photos/jobs/job-1/delivery/rear/p1.jpg",
      thumbnail_url: null,
      backend: "internal",
      backend_ref: null,
      label: null,
      created_at: "2026-01-01T00:00:00.000Z",
    } as Photo;

    const view = legacyPhotoToView(photo);
    expect(view.source).toBe("legacy");
    expect(view.jobId).toBe("job-1");
    expect(view.stage).toBe("delivery");
    expect(view.category).toBe("rear");
    expect(view.legacyType).toBe("delivery_exterior_rear");
    expect(view.legacyUrl).toBe(photo.url);
    expect(view.storagePath).toBeNull();
  });
});
