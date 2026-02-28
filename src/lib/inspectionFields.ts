import type { Inspection } from "./types";

/** Canonical checklist fields shared across POD report, PDF generation, etc. */
export const CHECKLIST_FIELDS: { key: keyof Inspection; label: string }[] = [
  { key: "vehicle_condition", label: "Vehicle Condition" },
  { key: "light_condition", label: "Light Condition" },
  { key: "oil_level_status", label: "Oil Level" },
  { key: "water_level_status", label: "Water Level" },
  { key: "handbook", label: "Handbook" },
  { key: "service_book", label: "Service Book" },
  { key: "mot", label: "MOT" },
  { key: "v5", label: "V5" },
  { key: "parcel_shelf", label: "Parcel Shelf" },
  { key: "spare_wheel_status", label: "Spare Wheel" },
  { key: "tool_kit", label: "Tool Kit" },
  { key: "tyre_inflation_kit", label: "Tyre Inflation Kit" },
  { key: "locking_wheel_nut", label: "Locking Wheel Nut" },
  { key: "sat_nav_working", label: "Sat Nav Working" },
  { key: "alloys_or_trims", label: "Alloys / Trims" },
  { key: "alloys_damaged", label: "Alloys Damaged" },
  { key: "wheel_trims_damaged", label: "Wheel Trims Damaged" },
  { key: "number_of_keys", label: "Number of Keys" },
  { key: "ev_charging_cables", label: "EV Charging Cables" },
  { key: "aerial", label: "Aerial" },
  { key: "customer_paperwork", label: "Customer Paperwork" },
];

export function getChecklistItems(inspection: Inspection | undefined) {
  if (!inspection) return [];
  return CHECKLIST_FIELDS.filter(f => {
    const val = inspection[f.key];
    return val != null && val !== "";
  });
}
