import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";

function fuelLabel(pct: number | null | undefined): string {
  if (pct == null) return "N/A";
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generatePodEmailBody(
  job: JobWithRelations
): { subject: string; body: string } {
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const subject = `POD Confirmation – AXENTRA – ${job.vehicle_reg} – ${ref}`;

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");

  const pickupDamages = job.damage_items.filter(
    (d) => pickup && d.inspection_id === pickup.id
  );
  const deliveryDamages = job.damage_items.filter(
    (d) => delivery && d.inspection_id === delivery.id
  );

  const pickupPhotos = job.photos.filter((p) =>
    p.type.startsWith("pickup_")
  );
  const deliveryPhotos = job.photos.filter((p) =>
    p.type.startsWith("delivery_")
  );
  const damagePhotos = job.photos.filter(
    (p) => p.type === "damage_close_up"
  );

  const pickupOdo = pickup?.odometer ?? null;
  const deliveryOdo = delivery?.odometer ?? null;
  const journeyMiles =
    pickupOdo != null && deliveryOdo != null
      ? deliveryOdo - pickupOdo
      : null;

  const journeyLine =
    journeyMiles != null && journeyMiles >= 0
      ? `${pickupOdo?.toLocaleString("en-GB")} → ${deliveryOdo?.toLocaleString(
          "en-GB"
        )} miles (approx. ${journeyMiles.toLocaleString(
          "en-GB"
        )} miles driven)`
      : "N/A";

  const lines: string[] = [];

  lines.push("AXENTRA VEHICLE LOGISTICS");
  lines.push("Proof of Delivery (POD)");
  lines.push("".padEnd(40, "═"));
  lines.push("");

  // Vehicle
  lines.push("VEHICLE");
  lines.push(
    `Registration: ${job.vehicle_reg} – ${job.vehicle_make} ${job.vehicle_model} (${job.vehicle_colour})`
  );
  if (job.vehicle_year) {
    lines.push(`Year: ${job.vehicle_year}`);
  }
  lines.push(`Job Reference: ${ref}`);
  lines.push("");

  // Journey overview
  lines.push("JOURNEY OVERVIEW");
  lines.push(
    `Route: ${job.pickup_city || "Unknown"} → ${
      job.delivery_city || "Unknown"
    }`
  );
  lines.push(`Pickup postcode: ${job.pickup_postcode}`);
  lines.push(`Delivery postcode: ${job.delivery_postcode}`);
  lines.push(`Mileage: ${journeyLine}`);
  lines.push("");

  // Pickup block
  lines.push("PICKUP DETAILS");
  lines.push(
    `Contact: ${job.pickup_contact_name} (${job.pickup_contact_phone})`
  );
  lines.push(
    `Location: ${job.pickup_address_line1}, ${job.pickup_city}, ${job.pickup_postcode}`
  );
  if (job.pickup_company) {
    lines.push(`Company: ${job.pickup_company}`);
  }
  lines.push(
    pickup
      ? `Date/Time: ${safeDate(pickup.inspected_at)}`
      : "Date/Time: Not completed"
  );
  lines.push(
    `Odometer: ${
      pickup?.odometer != null
        ? pickup.odometer.toLocaleString("en-GB")
        : "N/A"
    }`
  );
  lines.push(`Fuel: ${fuelLabel(pickup?.fuel_level_percent ?? null)}`);
  if (pickup?.vehicle_condition) {
    lines.push(`Vehicle condition: ${pickup.vehicle_condition}`);
  }
  if (pickup?.light_condition) {
    lines.push(`Light conditions: ${pickup.light_condition}`);
  }
  lines.push(`Recorded damages: ${pickupDamages.length}`);
  lines.push("");

  // Delivery block
  lines.push("DELIVERY DETAILS");
  lines.push(
    `Contact: ${job.delivery_contact_name} (${job.delivery_contact_phone})`
  );
  lines.push(
    `Location: ${job.delivery_address_line1}, ${job.delivery_city}, ${job.delivery_postcode}`
  );
  if (job.delivery_company) {
    lines.push(`Company: ${job.delivery_company}`);
  }
  lines.push(
    delivery
      ? `Date/Time: ${safeDate(delivery.inspected_at)}`
      : "Date/Time: Not completed"
  );
  lines.push(
    `Odometer: ${
      delivery?.odometer != null
        ? delivery.odometer.toLocaleString("en-GB")
        : "N/A"
    }`
  );
  lines.push(`Fuel: ${fuelLabel(delivery?.fuel_level_percent ?? null)}`);
  lines.push(`Recorded damages on delivery: ${deliveryDamages.length}`);
  lines.push("");

  // Photo summary
  lines.push("PHOTO SUMMARY");
  lines.push(`Pickup photos: ${pickupPhotos.length}`);
  lines.push(`Delivery photos: ${deliveryPhotos.length}`);
  lines.push(`Damage close-ups: ${damagePhotos.length}`);
  lines.push(
    "Note: Full-resolution images are held within the Axentra system and can be provided on request."
  );
  lines.push("");

  // Signatures (if captured)
  const pickupCustomerName = pickup?.customer_name || job.delivery_contact_name;
  const pickupDriver = pickup?.inspected_by_name || "Driver";
  const deliveryCustomerName =
    delivery?.customer_name || job.delivery_contact_name;
  const deliveryDriver = delivery?.inspected_by_name || pickupDriver;

  lines.push("SIGNATURES");
  lines.push(
    `Pickup – Driver: ${pickupDriver} | Customer: ${pickupCustomerName || "N/A"}`
  );
  lines.push(
    `Delivery – Driver: ${deliveryDriver} | Customer: ${
      deliveryCustomerName || "N/A"
    }`
  );
  lines.push("");

  // Declaration
  lines.push("DECLARATION");
  lines.push(
    "The customer confirms that the above vehicle has been inspected at the point of delivery and any noted damage or exceptions have been recorded on this POD and accompanying imagery."
  );
  lines.push("");

  // Footer
  lines.push("—");
  lines.push("Axentra Vehicle Logistics");
  lines.push("This email serves as formal POD confirmation.");

  const body = lines.join("\n");

  return { subject, body };
}

export function openPodEmail(job: JobWithRelations): void {
  const { subject, body } = generatePodEmailBody(job);
  const mailto = `mailto:?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  window.open(mailto, "_blank");
}