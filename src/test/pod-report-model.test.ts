import { describe, it, expect } from "vitest";
import type { JobWithRelations } from "@/lib/types";
import { buildPodReportModel, formatReg, formatUkPhone, photoCaption } from "@/lib/podReportModel";

function makeJob(overrides: Partial<Record<string, unknown>> = {}): JobWithRelations {
  return {
    id: "4210b517-c3f2-479c-a2bf-650eae26746a",
    external_job_number: "AX0070",
    status: "completed",
    vehicle_reg: "yd66owp",
    vehicle_make: "LAND ROVER",
    vehicle_model: "Range Rover Evoque",
    vehicle_colour: "BLACK",
    vehicle_year: "2016",
    pickup_address_line1: "40 Carlton View",
    pickup_city: "Leeds",
    pickup_postcode: "LS7 1NS",
    pickup_company: "Thrifty Leeds",
    pickup_contact_name: "Sam",
    pickup_contact_phone: "07700900123",
    delivery_address_line1: "64 Oaktree Crescent",
    delivery_city: "Knottingley",
    delivery_postcode: "WF11 0FA",
    delivery_company: null,
    delivery_contact_name: "Terrence",
    delivery_contact_phone: null,
    driver_name: "Panashe",
    inspections: [
      {
        id: "ip",
        type: "pickup",
        inspected_at: "2026-11-16T17:34:39Z",
        odometer: 93902,
        fuel_level_percent: 25,
        inspected_by_name: "Driver",
        customer_name: "Sam",
        notes: "  Dirty on collection ",
        vehicle_condition: "Dirty",
        mot: "Yes",
        driver_signature_url: "sig-pd",
        customer_signature_url: null,
      },
      {
        id: "id",
        type: "delivery",
        inspected_at: "2026-11-16T17:44:48Z",
        odometer: 93905,
        fuel_level_percent: 50,
        inspected_by_name: "Panashe",
        customer_name: "Terrence",
        notes: null,
        vehicle_condition: null,
        mot: null,
        driver_signature_url: "sig-dd",
        customer_signature_url: "sig-dc",
      },
    ],
    damage_items: [
      { id: "d1", inspection_id: "id", area: "Rear", item: "Bumper", damage_types: ["Scratch", "Scuff"], notes: null },
    ],
    photos: [],
    ...overrides,
  } as unknown as JobWithRelations;
}

const noPhotos = { pickupPhotos: [], deliveryPhotos: [], damagePhotos: [] };

describe("buildPodReportModel", () => {
  it("summarises the vehicle and journey", () => {
    const m = buildPodReportModel(makeJob(), noPhotos);
    expect(m.ref).toBe("AX0070");
    expect(m.reg).toBe("YD66 OWP");
    expect(m.vehicleTitle).toBe("Land Rover Range Rover Evoque");
    expect(m.vehicleSubtitle).toBe("Black · 2016");
    expect(m.status).toEqual({ label: "Delivered", tone: "success" });
    expect(m.stats.map((s) => s.label)).toEqual(["Collected", "Delivered", "Odometer", "Fuel"]);
    expect(m.stats[0].value).toBe("16 Nov 2026, 17:34");
    expect(m.stats[2]).toEqual({ label: "Odometer", value: "93,905 mi", detail: "+3 mi since collection" });
    expect(m.stats[3]).toEqual({ label: "Fuel", value: "1/2", detail: "1/4 at collection" });

    expect(m.collection.address).toBe("40 Carlton View, Leeds, LS7 1NS");
    expect(m.collection.phone).toBe("07700 900123");
    // The generic "Driver" placeholder falls back to the job's driver.
    expect(m.collection.driver).toBe("Panashe");
    expect(m.delivery.customer).toBe("Terrence");
    expect(m.delivery.damages).toBe(1);
    expect(m.collection.damages).toBe(0);
  });

  it("builds one checklist table across both stages, with notes", () => {
    const m = buildPodReportModel(makeJob(), noPhotos);
    expect(m.checklist?.hasCollection).toBe(true);
    // Nothing was filled in at delivery, so that column is dropped.
    expect(m.checklist?.hasDelivery).toBe(false);
    expect(m.checklist?.rows.find((r) => r.label.toLowerCase().includes("condition"))).toMatchObject({
      collection: "Dirty",
      delivery: null,
    });
    expect(m.checklist?.notes).toEqual([{ stage: "Collection", text: "Dirty on collection" }]);
  });

  it("V2 damage rows report the canonical panel label + severity; legacy rows unchanged", () => {
    const m = buildPodReportModel(
      makeJob({
        damage_items: [
          { id: "d1", inspection_id: "id", area: "Rear", item: "Bumper", damage_types: ["Scuff"], notes: null },
          {
            id: "d2", inspection_id: "id", area: "Nearside", item: "Front Left Door", damage_types: ["Scratch"],
            notes: "~5 cm", panel_id: "front_left_door", view_id: "top", severity: "minor",
          },
        ],
      }),
      noPhotos,
    );
    expect(m.damages).toEqual([
      { stage: "Delivery", location: "Rear", item: "Bumper", damage: "Scuff", notes: null },
      { stage: "Delivery", location: "Nearside", item: "Front Left Door", damage: "Scratch (Minor)", notes: "~5 cm" },
    ]);
  });

  it("lists damage, sign-offs and only POD-billable expenses", () => {
    const m = buildPodReportModel(makeJob(), noPhotos, [
      { category: "fuel", label: "Top-up", billable_on_pod: true },
      { category: "parking", label: "internal", billable_on_pod: false },
    ]);
    expect(m.damages).toEqual([
      { stage: "Delivery", location: "Rear", item: "Bumper", damage: "Scratch, Scuff", notes: null },
    ]);
    expect(m.signoffs.map((s) => s.stage)).toEqual(["Collection", "Delivery"]);
    expect(m.signoffs[0].signatures[1]).toEqual({ role: "Released by (customer)", name: "Sam", url: null });
    expect(m.signoffs[1].signatures[1]).toEqual({ role: "Received by (customer)", name: "Terrence", url: "sig-dc" });
    expect(m.expenses).toEqual([{ category: "Fuel", description: "Top-up" }]);
  });

  it("handles a job that has not been delivered yet", () => {
    const job = makeJob();
    job.inspections = job.inspections.filter((i) => i.type === "pickup");
    job.status = "in_transit" as JobWithRelations["status"];
    const m = buildPodReportModel(job, noPhotos);
    expect(m.status).toEqual({ label: "In transit", tone: "info" });
    expect(m.delivery.done).toBe(false);
    expect(m.stats[1].value).toBe("—");
    expect(m.signoffs).toHaveLength(1);
  });

  it("drops empty photo groups and captions photos sensibly", () => {
    const m = buildPodReportModel(makeJob(), {
      pickupPhotos: [{ url: "a", type: "pickup_exterior_front" }],
      deliveryPhotos: [],
      damagePhotos: [{ url: "b", type: "damage_close_up", label: "Rear bumper" }],
    });
    expect(m.photoGroups.map((g) => g.title)).toEqual(["Collection photos", "Damage close-ups"]);
    expect(photoCaption({ url: "a", type: "pickup_exterior_front" })).toBe("Front");
    expect(photoCaption({ url: "b", type: "damage_close_up" })).toBe("Damage close-up");
    expect(photoCaption({ url: "b", type: "damage_close_up", label: "Rear bumper" })).toBe("Rear bumper");
  });
});

describe("formatters", () => {
  it("formats UK registrations", () => {
    expect(formatReg("yd66owp")).toBe("YD66 OWP");
    expect(formatReg("YD66 OWP")).toBe("YD66 OWP");
    expect(formatReg("a1 abc")).toBe("A1 ABC");
    expect(formatReg(null)).toBe("—");
  });
  it("formats UK mobile numbers", () => {
    expect(formatUkPhone("07577791633")).toBe("07577 791633");
    expect(formatUkPhone("+447577791633")).toBe("+44 7577 791633");
    expect(formatUkPhone("0113 496 0000")).toBe("0113 496 0000");
    expect(formatUkPhone("  ")).toBeNull();
  });
});

describe("Proof of Collection", () => {
  it("keeps only what was recorded at collection", async () => {
    const { collectionOnlyJob, toCollectionModel } = await import("@/lib/podReportModel");
    const job = makeJob({
      damage_items: [
        { id: "dp", inspection_id: "ip", area: "Front", item: "Wing", damage_types: ["Dent"], notes: null },
        { id: "d1", inspection_id: "id", area: "Rear", item: "Bumper", damage_types: ["Scratch"], notes: null },
      ],
      photos: [
        { id: "p1", type: "pickup_front", inspection_id: "ip", url: "u1" },
        { id: "p2", type: "delivery_front", inspection_id: "id", url: "u2" },
        { id: "p3", type: "damage_close_up", inspection_id: "ip", url: "u3" },
        { id: "p4", type: "damage_close_up", inspection_id: "id", url: "u4" },
        { id: "p5", type: "damage_close_up", inspection_id: null, damage_item_id: "dp", url: "u5" },
      ],
    });
    const c = collectionOnlyJob(job);
    expect(c.inspections.map((i) => i.type)).toEqual(["pickup"]);
    expect(c.damage_items.map((d) => d.id)).toEqual(["dp"]);
    expect(c.photos.map((p) => p.id)).toEqual(["p1", "p3", "p5"]);

    const m = toCollectionModel(buildPodReportModel(c, noPhotos, [{ category: "fuel", label: "x" }]));
    expect(m.status).toEqual({ label: "Collected", tone: "info" });
    expect(m.stats.map((s) => s.label)).not.toContain("Delivered");
    expect(m.delivery.done).toBe(false);
    expect(m.signoffs.map((s) => s.stage)).toEqual(["Collection"]);
    expect(m.damages.map((d) => d.stage)).toEqual(["Collection"]);
    expect(m.expenses).toEqual([]);
  });
});
