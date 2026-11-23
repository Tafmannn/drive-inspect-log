import type { PortalJobSummary } from "../api";

/** "Leeds LS1 4DY", or "—" when neither is known. */
export function place(city: string | null, postcode: string | null): string {
  return [city, postcode].filter(Boolean).join(" ") || "—";
}

/** "Ford · Puma · Blue", or "Vehicle" when no details are on file. */
export function vehicleLine(j: PortalJobSummary): string {
  return [j.vehicle_make, j.vehicle_model, j.vehicle_colour].filter(Boolean).join(" · ") || "Vehicle";
}
