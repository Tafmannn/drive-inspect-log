import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";

export function generatePodEmailBody(job: JobWithRelations): {
  subject: string;
  body: string;
} {
  const ref = job.external_job_number || job.id.slice(0, 8);
  const subject = `Axentra POD – ${ref} ${job.vehicle_reg}`;

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
  const additionalPhotos = job.photos.filter((p) => p.label);

  const fuelLabel = (pct: number | null) =>
    pct != null ? FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%` : "N/A";

  const lines: string[] = [
    `AXENTRA – Proof of Delivery`,
    ``,
    `Job: ${ref}`,
    `Vehicle: ${job.vehicle_reg} – ${job.vehicle_make} ${job.vehicle_model} (${job.vehicle_colour})`,
    ``,
    `--- PICKUP ---`,
    `Contact: ${job.pickup_contact_name} (${job.pickup_contact_phone})`,
    `Address: ${[
      job.pickup_address_line1,
      job.pickup_city,
      job.pickup_postcode,
    ]
      .filter(Boolean)
      .join(", ")}`,
    pickup
      ? [
          `Date: ${
            pickup.inspected_at
              ? new Date(pickup.inspected_at).toLocaleString()
              : "N/A"
          }`,
          `Mileage: ${pickup.odometer ?? "N/A"}`,
          `Fuel: ${fuelLabel(pickup.fuel_level_percent)}`,
          `Damages: ${pickupDamages.length}`,
          `Photos: ${pickupPhotos.length}`,
        ].join("\n")
      : "Not completed",
    ``,
    `--- DELIVERY ---`,
    `Contact: ${job.delivery_contact_name} (${job.delivery_contact_phone})`,
    `Address: ${[
      job.delivery_address_line1,
      job.delivery_city,
      job.delivery_postcode,
    ]
      .filter(Boolean)
      .join(", ")}`,
    delivery
      ? [
          `Date: ${
            delivery.inspected_at
              ? new Date(delivery.inspected_at).toLocaleString()
              : "N/A"
          }`,
          `Mileage: ${delivery.odometer ?? "N/A"}`,
          `Fuel: ${fuelLabel(delivery.fuel_level_percent)}`,
          `Damages: ${deliveryDamages.length}`,
          `Photos: ${deliveryPhotos.length}`,
        ].join("\n")
      : "Not completed",
    ``,
    `--- PHOTO SUMMARY ---`,
    `Pickup photos: ${pickupPhotos.length}`,
    `Delivery photos: ${deliveryPhotos.length}`,
    `Damage close-ups: ${damagePhotos.length}`,
    `Additional labelled photos: ${additionalPhotos.length}`,
  ];

  if (additionalPhotos.length > 0) {
    const labels = additionalPhotos
      .map((p) => p.label)
      .filter(Boolean)
      .join(", ");
    lines.push(`Labels: ${labels}`);
  }

  lines.push(
    ``,
    `Photos are stored in the Axentra system and can be provided separately as attachments if required.`
  );

  return { subject, body: lines.join("\n") };
}

export function openPodEmail(job: JobWithRelations): void {
  const { subject, body } = generatePodEmailBody(job);
  const mailto = `mailto:?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  window.open(mailto, "_blank");
}