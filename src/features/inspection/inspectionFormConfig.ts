/**
 * Inspection flow — extracted constants & pure helpers.
 *
 * The InspectionFlow page intentionally keeps its renderers inline (see the
 * comment block at the top of those renderers) because converting them to
 * <Component/> instances would cause unmount/remount on every parent render,
 * destroying input focus on mobile keyboards and clearing the signature canvas.
 *
 * What CAN safely live outside the component:
 *   • Form state shape & initial value
 *   • Per-step validation rules (pure)
 *   • Photo type configuration
 *   • Review checklist labels
 *   • Inspection payload mappers (form → DB row)
 *
 * Keeping these here:
 *   • Drops ~200 lines from the parent file.
 *   • Lets us unit-test validation in isolation (already covered by
 *     src/test/inspection-transitions.test.ts for the transition rules;
 *     per-step validation is now also accessible).
 *   • Removes magic strings (FUEL_LEVEL_MAP, photo keys) from JSX.
 */
import { FUEL_LEVEL_MAP } from "@/lib/types";
import type {
  InspectionType,
  DamageItemDraft,
  AdditionalPhotoDraft,
} from "@/lib/types";

// ── Form state ───────────────────────────────────────────────────────

export interface InspectionFormState {
  odometer: string;
  fuelLevel: string;
  vehicleCondition: string;
  lightCondition: string;
  oilLevel: string;
  waterLevel: string;
  notes: string;
  handbook: string;
  serviceBook: string;
  mot: string;
  v5: string;
  parcelShelf: string;
  spareWheel: string;
  toolKit: string;
  tyreInflationKit: string;
  lockingWheelNut: string;
  satNavWorking: string;
  alloysOrTrims: string;
  alloysDamaged: string;
  wheelTrimsDamaged: string;
  numberOfKeys: string;
  evChargingCables: string;
  aerial: string;
  customerPaperwork: string;
  damages: DamageItemDraft[];
  standardPhotos: Record<string, File | null>;
  standardPhotoUrls: Record<string, string>;
  additionalPhotos: AdditionalPhotoDraft[];
  driverName: string;
  customerName: string;
}

export const INITIAL_INSPECTION_FORM: InspectionFormState = {
  odometer: "",
  fuelLevel: "",
  vehicleCondition: "",
  lightCondition: "",
  oilLevel: "",
  waterLevel: "",
  notes: "",
  handbook: "",
  serviceBook: "",
  mot: "",
  v5: "",
  parcelShelf: "",
  spareWheel: "",
  toolKit: "",
  tyreInflationKit: "",
  lockingWheelNut: "",
  satNavWorking: "",
  alloysOrTrims: "",
  alloysDamaged: "",
  wheelTrimsDamaged: "",
  numberOfKeys: "",
  evChargingCables: "",
  aerial: "",
  customerPaperwork: "",
  damages: [],
  standardPhotos: {},
  standardPhotoUrls: {},
  additionalPhotos: [],
  driverName: "",
  customerName: "",
};

// ── Step counts ──────────────────────────────────────────────────────

export const PICKUP_STEP_COUNT = 6;
export const DELIVERY_STEP_COUNT = 5;

export function getTotalSteps(type: InspectionType): number {
  return type === "pickup" ? PICKUP_STEP_COUNT : DELIVERY_STEP_COUNT;
}

/** Step number where signature capture happens (varies by inspection type). */
export function getSignatureStepNumber(type: InspectionType): number {
  return type === "pickup" ? 5 : 4;
}

// ── Photo configuration ──────────────────────────────────────────────

export const PHOTO_TYPES_BY_INSPECTION: Record<
  InspectionType,
  { key: string; label: string }[]
> = {
  pickup: [
    { key: "pickup_exterior_front", label: "Front" },
    { key: "pickup_exterior_rear", label: "Rear" },
    { key: "pickup_exterior_driver_side", label: "Driver Side" },
    { key: "pickup_exterior_passenger_side", label: "Passenger Side" },
    { key: "pickup_interior", label: "Interior" },
    { key: "pickup_dashboard", label: "Dashboard" },
    { key: "pickup_fuel_gauge", label: "Fuel Gauge" },
  ],
  delivery: [
    { key: "delivery_exterior_front", label: "Front" },
    { key: "delivery_exterior_rear", label: "Rear" },
    { key: "delivery_exterior_driver_side", label: "Driver Side" },
    { key: "delivery_exterior_passenger_side", label: "Passenger Side" },
    { key: "delivery_interior", label: "Interior" },
    { key: "delivery_dashboard", label: "Dashboard" },
    { key: "delivery_fuel_gauge", label: "Fuel Gauge" },
  ],
};

// ── Review checklist ─────────────────────────────────────────────────

export const REVIEW_CHECKLIST = [
  { field: "vehicleCondition" as const, label: "Vehicle Condition" },
  { field: "lightCondition" as const, label: "Light Condition" },
  { field: "oilLevel" as const, label: "Oil Level" },
  { field: "waterLevel" as const, label: "Water Level" },
  { field: "handbook" as const, label: "Handbook" },
  { field: "serviceBook" as const, label: "Service Book" },
  { field: "mot" as const, label: "MOT" },
  { field: "v5" as const, label: "V5" },
  { field: "parcelShelf" as const, label: "Parcel Shelf" },
  { field: "spareWheel" as const, label: "Spare Wheel" },
  { field: "toolKit" as const, label: "Tool Kit" },
  { field: "tyreInflationKit" as const, label: "Tyre Inflation Kit" },
  { field: "lockingWheelNut" as const, label: "Locking Wheel Nut" },
  { field: "satNavWorking" as const, label: "Sat Nav Working" },
  { field: "alloysOrTrims" as const, label: "Alloys / Trims" },
  { field: "alloysDamaged" as const, label: "Alloys Damaged" },
  { field: "wheelTrimsDamaged" as const, label: "Wheel Trims Damaged" },
  { field: "numberOfKeys" as const, label: "Number of Keys" },
  { field: "evChargingCables" as const, label: "EV Charging Cables" },
  { field: "aerial" as const, label: "Aerial" },
  { field: "customerPaperwork" as const, label: "Customer Paperwork" },
] as const;

/** Field map for rendering the saved-pickup checklist on the delivery review screen. */
export const SAVED_PICKUP_FIELDS = [
  { key: "vehicle_condition" as const, label: "Vehicle Condition" },
  { key: "light_condition" as const, label: "Light Condition" },
  { key: "oil_level_status" as const, label: "Oil Level" },
  { key: "water_level_status" as const, label: "Water Level" },
  { key: "handbook" as const, label: "Handbook" },
  { key: "service_book" as const, label: "Service Book" },
  { key: "mot" as const, label: "MOT" },
  { key: "v5" as const, label: "V5" },
  { key: "parcel_shelf" as const, label: "Parcel Shelf" },
  { key: "spare_wheel_status" as const, label: "Spare Wheel" },
  { key: "tool_kit" as const, label: "Tool Kit" },
  { key: "tyre_inflation_kit" as const, label: "Tyre Inflation Kit" },
  { key: "locking_wheel_nut" as const, label: "Locking Wheel Nut" },
  { key: "sat_nav_working" as const, label: "Sat Nav Working" },
  { key: "alloys_or_trims" as const, label: "Alloys / Trims" },
  { key: "alloys_damaged" as const, label: "Alloys Damaged" },
  { key: "wheel_trims_damaged" as const, label: "Wheel Trims Damaged" },
  { key: "number_of_keys" as const, label: "Number of Keys" },
  { key: "ev_charging_cables" as const, label: "EV Charging Cables" },
  { key: "aerial" as const, label: "Aerial" },
  { key: "customer_paperwork" as const, label: "Customer Paperwork" },
] as const;

// ── Per-step validation ──────────────────────────────────────────────

export interface ValidationContext {
  formState: InspectionFormState;
  driverSigned: boolean;
  customerSigned: boolean;
}

/**
 * Returns the human-readable list of missing fields for the given step.
 * Empty array means the step is valid.
 *
 * Step numbering (1-indexed):
 *   pickup:   1=odometer/fuel, 2=checklist, 3=damage, 4=photos, 5=signatures, 6=review
 *   delivery: 1=odometer/fuel, 2=damage, 3=photos, 4=signatures, 5=review
 */
export function validateInspectionStep(
  type: InspectionType,
  step: number,
  ctx: ValidationContext,
): string[] {
  const { formState, driverSigned, customerSigned } = ctx;
  const missing: string[] = [];

  if (type === "pickup") {
    switch (step) {
      case 1:
        if (!formState.odometer) missing.push("Odometer reading");
        if (!formState.fuelLevel) missing.push("Fuel level");
        break;
      case 2:
        if (!formState.vehicleCondition) missing.push("Vehicle condition");
        if (!formState.lightCondition) missing.push("Light condition");
        if (!formState.numberOfKeys) missing.push("Number of keys");
        break;
      case 3: // Damage – optional
        break;
      case 4: {
        const hasPhotos =
          Object.values(formState.standardPhotos).filter(Boolean).length > 0;
        if (!hasPhotos) missing.push("At least one pickup photo");
        break;
      }
      case 5:
        if (!formState.driverName) missing.push("Driver name");
        if (!driverSigned) missing.push("Driver signature");
        if (!formState.customerName) missing.push("Customer name");
        if (!customerSigned) missing.push("Customer signature");
        break;
    }
  } else {
    switch (step) {
      case 1:
        if (!formState.odometer) missing.push("Odometer reading");
        if (!formState.fuelLevel) missing.push("Fuel level");
        break;
      case 2: // Damage – optional
        break;
      case 3: {
        const hasPhotos =
          Object.values(formState.standardPhotos).filter(Boolean).length > 0 ||
          formState.additionalPhotos.length > 0;
        if (!hasPhotos) missing.push("At least one delivery photo");
        break;
      }
      case 4:
        if (!formState.driverName) missing.push("Driver name");
        if (!driverSigned) missing.push("Driver signature");
        if (!formState.customerName) missing.push("Customer name");
        if (!customerSigned) missing.push("Customer signature");
        break;
    }
  }

  return missing;
}

/** Aggregates validation across every step except the final review. */
export function validateBeforeSubmit(
  type: InspectionType,
  ctx: ValidationContext,
): string[] {
  const total = getTotalSteps(type);
  const all: string[] = [];
  for (let s = 1; s < total; s++) {
    all.push(...validateInspectionStep(type, s, ctx));
  }
  return all;
}

// ── Payload mapping ──────────────────────────────────────────────────

/**
 * Maps the in-component form state to the snake_case payload accepted by
 * `submitInspection`. Pickup-only fields are included only when type === pickup.
 */
export function buildInspectionPayload(
  type: InspectionType,
  formState: InspectionFormState,
  signatures: {
    driverSignatureUrl: string | null;
    customerSignatureUrl: string | null;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    odometer: formState.odometer ? parseInt(formState.odometer, 10) : null,
    fuel_level_percent: FUEL_LEVEL_MAP[formState.fuelLevel] ?? null,
    inspected_by_name: formState.driverName || null,
    customer_name: formState.customerName || null,
    driver_signature_url: signatures.driverSignatureUrl,
    customer_signature_url: signatures.customerSignatureUrl,
    notes: formState.notes || null,
  };

  if (type !== "pickup") return base;

  return {
    ...base,
    vehicle_condition: formState.vehicleCondition || null,
    light_condition: formState.lightCondition || null,
    oil_level_status: formState.oilLevel || null,
    water_level_status: formState.waterLevel || null,
    handbook: formState.handbook || null,
    service_book: formState.serviceBook || null,
    mot: formState.mot || null,
    v5: formState.v5 || null,
    parcel_shelf: formState.parcelShelf || null,
    spare_wheel_status: formState.spareWheel || null,
    tool_kit: formState.toolKit || null,
    tyre_inflation_kit: formState.tyreInflationKit || null,
    locking_wheel_nut: formState.lockingWheelNut || null,
    sat_nav_working: formState.satNavWorking || null,
    alloys_or_trims: formState.alloysOrTrims || null,
    alloys_damaged: formState.alloysDamaged || null,
    wheel_trims_damaged: formState.wheelTrimsDamaged || null,
    number_of_keys: formState.numberOfKeys || null,
    ev_charging_cables: formState.evChargingCables || null,
    aerial: formState.aerial || null,
    customer_paperwork: formState.customerPaperwork || null,
  };
}

/** Maps form damage drafts to the API damage_items payload (without photo URL). */
export function buildDamageItemsPayload(
  damages: DamageItemDraft[],
): Array<Record<string, unknown>> {
  return damages.map((d) => ({
    x: d.x,
    y: d.y,
    area: d.area,
    location: d.location,
    item: d.item,
    damage_types: d.damageTypes,
    notes: d.notes,
    photo_url: null, // Populated when upload completes
  }));
}
