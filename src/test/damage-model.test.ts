import { describe, expect, it } from "vitest";
import { BODY_TYPES, normaliseBodyType, resolveBodyType } from "@/features/damage/bodyTypes";
import {
  attachRestoredPhotos, buildDamagePayloadItem, damagePhotoFiles, sanitiseRestoredDamages,
  savedDamageDescription, savedDamageLabel, serialiseDamagesForDraft, validateDamage, withLegacyFields,
} from "@/features/damage/damageModel";
import { legacyFieldsForPanel, PANELS, DIAGRAM_VERSION } from "@/features/damage/panels";
import type { DamageItemDraft } from "@/lib/types";
import {
  INITIAL_INSPECTION_FORM, buildDamageItemsPayload, buildInspectionPayload, validateInspectionStep,
} from "@/features/inspection/inspectionFormConfig";

const file = (name = "a.jpg") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

const v2 = (over: Partial<DamageItemDraft> = {}): DamageItemDraft =>
  withLegacyFields({
    tempId: "t1", x: 40, y: 50, area: "", location: "", item: "",
    damageTypes: ["Scratch"], notes: "~5cm", panelId: "front_left_door", viewId: "top",
    panelU: 0.4, panelV: 0.55, bodyType: "saloon", diagramVersion: DIAGRAM_VERSION, severity: "minor",
    photos: [], ...over,
  });

describe("body type resolution", () => {
  it.each([
    ["Panel Van", "van"], ["LWB VAN", "van"], ["Pick-up", "pickup"], ["Double Cab Pickup", "pickup"],
    ["4 Door Saloon", "saloon"], ["Sedan", "saloon"], ["5 door hatchback", "hatchback"],
    ["Estate", "estate"], ["Touring", "estate"], ["Station Wagon", "estate"], ["Coupe", "coupe"],
    ["Coupé", "coupe"], ["Cabriolet", "convertible"], ["Convertible", "convertible"], ["Roadster", "convertible"],
    ["MPV", "mpv"], ["People carrier", "mpv"], ["SUV", "suv"], ["Crossover", "suv"],
  ])("%s → %s", (raw, bt) => expect(normaliseBodyType(raw)).toBe(bt));

  it("each of the nine canonical ids loads as itself", () => {
    for (const bt of BODY_TYPES) expect(resolveBodyType({ jobVehicleType: bt }).bodyType).toBe(bt);
  });

  it("unknown, ambiguous and manufacturer-only values do not resolve (never defaults to saloon)", () => {
    for (const raw of [null, "", "Car", "BMW", "Ford", "4x4", "MPV/SUV", "Commercial", "Other"]) {
      expect(normaliseBodyType(raw)).toBeNull();
    }
    expect(resolveBodyType({ jobVehicleType: "Ford" })).toEqual({ bodyType: null, source: null, raw: "Ford" });
  });

  it("priority: manual > job > catalogue", () => {
    expect(resolveBodyType({ manual: "van", jobVehicleType: "Saloon", catalogueBodyType: "SUV" })).toMatchObject({ bodyType: "van", source: "manual" });
    expect(resolveBodyType({ manual: "", jobVehicleType: "Saloon", catalogueBodyType: "SUV" })).toMatchObject({ bodyType: "saloon", source: "job" });
    expect(resolveBodyType({ jobVehicleType: null, catalogueBodyType: "SUV" })).toMatchObject({ bodyType: "suv", source: "catalogue" });
    // an unusable manual value never wins
    expect(resolveBodyType({ manual: "spaceship", jobVehicleType: "Estate" }).bodyType).toBe("estate");
  });
});

describe("panel catalogue", () => {
  it("ids are stable snake_case and UK sides map left=nearside, right=offside", () => {
    for (const id of Object.keys(PANELS)) expect(id).toMatch(/^[a-z][a-z_]{1,47}$/);
    expect(legacyFieldsForPanel("front_left_door")).toEqual({ area: "Nearside", location: "Panels", item: "Front Left Door" });
    expect(legacyFieldsForPanel("rear_right_window")).toEqual({ area: "Offside", location: "Glass", item: "Rear Right Window" });
    expect(legacyFieldsForPanel("bonnet").area).toBe("Front of Vehicle");
    expect(legacyFieldsForPanel("tailgate").area).toBe("Rear of Vehicle");
    expect(legacyFieldsForPanel("other", "Interior – seat")).toEqual({ area: "Interior", location: "Other", item: "Interior – seat" });
  });
});

describe("damage records", () => {
  it("validates panel, type and severity", () => {
    expect(validateDamage(v2())).toEqual([]);
    expect(validateDamage(v2({ panelId: null }))).toContain("Panel");
    expect(validateDamage(v2({ damageTypes: [] }))).toContain("Damage type");
    expect(validateDamage(v2({ severity: null }))).toContain("Severity");
    expect(validateDamage(v2({ panelId: "other", customLabel: "  " }))).toContain("Description of location");
    expect(validateDamage(v2({ panelId: "not_a_panel" }))).toContain("Panel");
  });

  it("payload carries the stable panel id plus legacy text that agrees with it", () => {
    const p = buildDamagePayloadItem(v2({ damageTypes: ["Scratch", "Dent"] }));
    expect(p).toMatchObject({
      panel_id: "front_left_door", view_id: "top", body_type: "saloon", diagram_version: DIAGRAM_VERSION,
      severity: "minor", panel_position: { u: 0.4, v: 0.55 },
      area: "Nearside", item: "Front Left Door", damage_types: ["Scratch", "Dent"], photo_url: null,
    });
  });

  it("legacy drafts keep their fields and send no guessed panel", () => {
    const legacy: DamageItemDraft = { tempId: "L", x: 10, y: 20, area: "Nearside", location: "Panels", item: "Door", damageTypes: ["Dent"], notes: "" };
    expect(buildDamagePayloadItem(legacy)).toMatchObject({ panel_id: null, view_id: null, severity: null, area: "Nearside", item: "Door" });
    expect(buildDamageItemsPayload([legacy, v2()])).toHaveLength(2);
  });

  it("multiple photos per damage; legacy single photo still counted", () => {
    const d = v2({ photos: [{ id: "p1", file: file(), previewUrl: "blob:1" }, { id: "p2", file: file(), previewUrl: "blob:2" }] });
    expect(damagePhotoFiles(d)).toHaveLength(2);
    expect(damagePhotoFiles({ ...v2(), photos: undefined, photo: file() })).toHaveLength(1);
  });

  it("draft JSON never contains File objects and restores without phantom photos", () => {
    const d = v2({ photos: [{ id: "p1", file: file(), previewUrl: "blob:1" }], photo: file() });
    const json = JSON.parse(JSON.stringify(serialiseDamagesForDraft([d])));
    expect(json[0].photos).toBeUndefined();
    expect(json[0].photo).toBeUndefined();
    expect(json[0].photoIds).toEqual(["p1"]);
    // an old-format draft stored the File as {} — that must not come back as a "photo"
    const restored = sanitiseRestoredDamages([{ ...json[0], photo: {} }, { junk: true }]);
    expect(restored).toHaveLength(1);
    expect(damagePhotoFiles(restored[0])).toHaveLength(0);
    const withPhotos = attachRestoredPhotos(restored, [
      { id: "p1", damageTempId: "t1", file: file() },
      { id: "pX", damageTempId: "other", file: file() },
    ], () => "blob:x");
    expect(withPhotos[0].photos!.map((p) => p.id)).toEqual(["p1"]);
    // re-attaching is idempotent (no duplicate photos)
    const again = attachRestoredPhotos(withPhotos, [{ id: "p1", damageTempId: "t1", file: file() }], () => "blob:y");
    expect(again[0].photos).toHaveLength(1);
  });

  it("saved rows: V2 labels from panel id; legacy rows stay readable and flagged", () => {
    expect(savedDamageLabel({ panel_id: "front_left_door", area: "Nearside", item: "Front Left Door" })).toEqual({ label: "Front Left Door (nearside)", legacy: false });
    expect(savedDamageLabel({ panel_id: null, area: "Offside", item: "Wing" })).toEqual({ label: "Offside – Wing", legacy: true });
    expect(savedDamageLabel({ panel_id: null, area: null, item: null }).legacy).toBe(true);
    expect(savedDamageDescription({ damage_types: ["Dent"], severity: "moderate" })).toBe("Dent (Moderate)");
    expect(savedDamageDescription({ damage_types: ["Dent"], severity: null })).toBe("Dent");
  });
});

describe("damage step: empty list is not a damage-free inspection", () => {
  const ctx = (over: Partial<typeof INITIAL_INSPECTION_FORM>) => ({
    formState: { ...INITIAL_INSPECTION_FORM, ...over }, driverSigned: false, customerSigned: false,
  });
  it("blocks Next until damage is recorded or 'no damage' is confirmed (pickup step 3, delivery step 2)", () => {
    expect(validateInspectionStep("pickup", 3, ctx({}))).toHaveLength(1);
    expect(validateInspectionStep("delivery", 2, ctx({}))).toHaveLength(1);
    expect(validateInspectionStep("pickup", 3, ctx({ damageDeclaration: "none_found" }))).toEqual([]);
    expect(validateInspectionStep("delivery", 2, ctx({ damages: [v2()] }))).toEqual([]);
  });
  it("inspection payload states the declaration", () => {
    const sig = { driverSignatureUrl: null, customerSignatureUrl: null };
    expect(buildInspectionPayload("pickup", { ...INITIAL_INSPECTION_FORM }, sig).damage_declaration).toBeNull();
    expect(buildInspectionPayload("pickup", { ...INITIAL_INSPECTION_FORM, damageDeclaration: "none_found" }, sig).damage_declaration).toBe("none_found");
    expect(buildInspectionPayload("delivery", { ...INITIAL_INSPECTION_FORM, damages: [v2()], damageDeclaration: "none_found" }, sig).damage_declaration).toBe("recorded");
  });
});
