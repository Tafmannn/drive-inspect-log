// src/lib/podEmail.ts
// Branded Axentra POD email generator (text-only but formatted)
// Used for "Email POD" flows via mailto: links.

import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";

function fuelLabel(pct: number | null): string {
  if (pct == null) return "N/A";
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "N/A";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatMileage(value: number | null | undefined): string {
  if (value == null) return "N/A";
  try {
    return new Intl.NumberFormat("en-GB").format(value) + " mi";
  } catch {
    return `${value} mi`;
  }
}

export function generatePodEmailBody(
  job: JobWithRelations,
): { subject: string; body: string } {
  const ref = job.external_job_number || job.id.slice(0, 8);
  const subject = `Axentra Vehicles | POD – ${ref} – ${job.vehicle_reg}`;

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");

  const pickupDamages = job.damage_items.filter(
    (d) => pickup && d.inspection_id === pickup.id,
  );
  const deliveryDamages = job.damage_items.filter(
    (d) => delivery && d.inspection_id === delivery.id,
  );

  const pickupPhotos = job.photos.filter((p) =>
    p.type.startsWith("pickup_"),
  );
  const deliveryPhotos = job.photos.filter((p) =>
    p.type.startsWith("delivery_"),
  );

  const pickupOdo = pickup?.odometer ?? null;
  const deliveryOdo = delivery?.odometer ?? null;
  const mileageDelta =
    pickupOdo != null && deliveryOdo != null
      ? deliveryOdo - pickupOdo
      : null;

  const lines: string[] = [];

  // ─────────────────────────────────────────
  // BRAND HEADER
  // ─────────────────────────────────────────
  lines.push(
    "AXENTRA VEHICLES",
    "Professional Driven Vehicle Logistics",
    "www.axentravehicles.co.uk",
    "",
    "PROOF OF DELIVERY (POD)",
    "────────────────────────────────────────",
    "",
  );

  // ─────────────────────────────────────────
  // JOB SUMMARY
  // ─────────────────────────────────────────
  lines.push("JOB SUMMARY");
  lines.push("────────────────");
  lines.push(`Job Ref.............: ${ref}`);
  if (job.external_job_number) {
    lines.push(
      `Client Ref..........: ${job.external_job_number}`,
    );
  }
  lines.push(
    `Vehicle.............: ${job.vehicle_reg} – ${job.vehicle_make} ${job.vehicle_model} (${job.vehicle_colour})`,
  );
  if (job.vehicle_year) {
    lines.push(`Year................: ${job.vehicle_year}`);
  }
  lines.push("");

  // ─────────────────────────────────────────
  // PICKUP BLOCK
  // ─────────────────────────────────────────
  lines.push("PICKUP DETAILS");
  lines.push("────────────────");
  lines.push(
    `Contact.............: ${job.pickup_contact_name} (${job.pickup_contact_phone})`,
  );
  lines.push(
    `Address.............: ${[
      job.pickup_address_line1,
      job.pickup_city,
      job.pickup_postcode,
    ]
      .filter(Boolean)
      .join(", ")}`,
  );

  if (pickup) {
    lines.push(
      `Date/Time...........: ${formatDateTime(pickup.inspected_at)}`,
      `Mileage at Pickup...: ${formatMileage(pickup.odometer)}`,
      `Fuel at Pickup......: ${fuelLabel(pickup.fuel_level_percent)}`,
      `Recorded Damages....: ${pickupDamages.length}`,
      `Pickup Photos.......: ${pickupPhotos.length}`,
    );
    if (pickup.notes) {
      lines.push(
        `Pickup Notes........: ${pickup.notes.trim()}`,
      );
    }
    if (pickup.customer_name || pickup.inspected_by_name) {
      lines.push(
        `Signed (Customer)...: ${
          pickup.customer_name || "N/A"
        }`,
        `Signed (Driver).....: ${
          pickup.inspected_by_name || "N/A"
        }`,
      );
    }
  } else {
    lines.push("Status..............: Pickup inspection not completed");
  }
  lines.push("");

  // ─────────────────────────────────────────
  // DELIVERY BLOCK
  // ─────────────────────────────────────────
  lines.push("DELIVERY DETAILS");
  lines.push("────────────────");
  lines.push(
    `Contact.............: ${job.delivery_contact_name} (${job.delivery_contact_phone})`,
  );
  lines.push(
    `Address.............: ${[
      job.delivery_address_line1,
      job.delivery_city,
      job.delivery_postcode,
    ]
      .filter(Boolean)
      .join(", ")}`,
  );

  if (delivery) {
    lines.push(
      `Date/Time...........: ${formatDateTime(delivery.inspected_at)}`,
      `Mileage at Delivery.: ${formatMileage(delivery.odometer)}`,
      `Fuel at Delivery....: ${fuelLabel(
        delivery.fuel_level_percent,
      )}`,
      `Recorded Damages....: ${deliveryDamages.length}`,
      `Delivery Photos.....: ${deliveryPhotos.length}`,
    );
    if (delivery.notes) {
      lines.push(
        `Delivery Notes......: ${delivery.notes.trim()}`,
      );
    }
    if (delivery.customer_name || delivery.inspected_by_name) {
      lines.push(
        `Signed (Customer)...: ${
          delivery.customer_name || "N/A"
        }`,
        `Signed (Driver).....: ${
          delivery.inspected_by_name || "N/A"
        }`,
      );
    }
  } else {
    lines.push(
      "Status..............: Delivery inspection not completed",
    );
  }
  lines.push("");

  // ─────────────────────────────────────────
  // MILEAGE & FUEL SUMMARY
  // ─────────────────────────────────────────
  lines.push("MILEAGE & FUEL SUMMARY");
  lines.push("──────────────────────");
  lines.push(
    `Pickup Mileage......: ${
      pickupOdo != null ? formatMileage(pickupOdo) : "N/A"
    }`,
  );
  lines.push(
    `Delivery Mileage....: ${
      deliveryOdo != null ? formatMileage(deliveryOdo) : "N/A"
    }`,
  );
  lines.push(
    `Total Distance......: ${
      mileageDelta != null
        ? new Intl.NumberFormat("en-GB").format(mileageDelta) +
          " mi"
        : "N/A"
    }`,
  );
  lines.push(
    `Pickup Fuel.........: ${fuelLabel(
      pickup?.fuel_level_percent ?? null,
    )}`,
  );
  lines.push(
    `Delivery Fuel.......: ${fuelLabel(
      delivery?.fuel_level_percent ?? null,
    )}`,
  );
  lines.push("");

  // ─────────────────────────────────────────
  // DAMAGE / PHOTO SUMMARY
  // ─────────────────────────────────────────
  const totalDamages =
    pickupDamages.length + deliveryDamages.length;
  const totalPhotos = pickupPhotos.length + deliveryPhotos.length;

  lines.push("DAMAGE & MEDIA SUMMARY");
  lines.push("──────────────────────");
  lines.push(
    `Total Recorded Damages: ${totalDamages} (Pickup: ${pickupDamages.length}, Delivery: ${deliveryDamages.length})`,
  );
  lines.push(
    `Total Photos........: ${totalPhotos} (Pickup: ${pickupPhotos.length}, Delivery: ${deliveryPhotos.length})`,
  );
  lines.push(
    "",
    "All supporting photos are stored in the Axentra system",
    "and will be provided as attachments or via secure link.",
    "",
  );

  // ─────────────────────────────────────────
  // BRAND FOOTER
  // ─────────────────────────────────────────
  lines.push(
    "────────────────────────────────────────",
    "Axentra Vehicles",
    "Driven Vehicle Logistics · Trade Plate Specialists",
    "www.axentravehicles.co.uk",
  );

  return {
    subject,
    body: lines.join("\n"),
  };
}

export function openPodEmail(job: JobWithRelations): void {
  const { subject, body } = generatePodEmailBody(job);
  const mailto = `mailto:?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
  window.open(mailto, "_blank");
}