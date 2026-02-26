import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { JobWithRelations, Inspection } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";

const CHECKLIST_FIELDS: { key: keyof Inspection; label: string }[] = [
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

function fuelLabel(pct: number | null | undefined): string {
  if (pct == null) return "N/A";
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 37, 41);
  doc.text(title, 14, y);
  return y + 7;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generatePodPdf(job: JobWithRelations): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const pickupDamages = job.damage_items.filter(d => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter(d => delivery && d.inspection_id === delivery.id);
  const pickupPhotos = job.photos.filter(p => p.type.startsWith("pickup_"));
  const deliveryPhotos = job.photos.filter(p => p.type.startsWith("delivery_"));

  // ── Header banner ──
  doc.setFillColor(33, 37, 41);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("AXENTRA VEHICLE LOGISTICS", 14, 10);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Proof of Delivery", 14, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Ref: ${ref}`, pageWidth - 14, 14, { align: "right" });
  doc.text(safeDate(job.completed_at || new Date().toISOString()), pageWidth - 14, 22, { align: "right" });

  let y = 36;

  // ── Vehicle info ──
  y = addSectionTitle(doc, "Vehicle Details", y);
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    body: [
      ["Registration", job.vehicle_reg],
      ["Make / Model", `${job.vehicle_make} ${job.vehicle_model}`],
      ["Colour", job.vehicle_colour],
      ...(job.vehicle_year ? [["Year", job.vehicle_year]] : []),
      ["Job Reference", ref],
      ["Route", `${job.pickup_city || "—"} → ${job.delivery_city || "—"}`],
      ["Collection Status", pickup ? "✓ Collected" : "Not collected"],
      ["Delivery Status", delivery ? "✓ Delivered" : "Not delivered"],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Pickup details ──
  y = addSectionTitle(doc, "Pickup Details", y);
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    body: [
      ["Contact", `${job.pickup_contact_name} (${job.pickup_contact_phone})`],
      ["Address", `${job.pickup_address_line1}, ${job.pickup_city}, ${job.pickup_postcode}`],
      ...(job.pickup_company ? [["Company", job.pickup_company]] : []),
      ["Date/Time", pickup ? safeDate(pickup.inspected_at) : "—"],
      ["Odometer", pickup?.odometer != null ? pickup.odometer.toLocaleString("en-GB") : "—"],
      ["Fuel", fuelLabel(pickup?.fuel_level_percent ?? null)],
      ["Driver", pickup?.inspected_by_name || "—"],
      ["Customer", pickup?.customer_name || "—"],
      ["Damages", String(pickupDamages.length)],
      ["Photos", String(pickupPhotos.length)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Pickup checklist ──
  if (pickup) {
    const items = CHECKLIST_FIELDS
      .filter(f => { const v = pickup[f.key]; return v != null && v !== ""; })
      .map(f => [f.label, String(pickup[f.key])]);

    if (items.length > 0) {
      y = addSectionTitle(doc, "Pickup Checklist", y);
      if (y > 250) { doc.addPage(); y = 14; }
      autoTable(doc, {
        startY: y,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [33, 37, 41] },
        head: [["Item", "Value"]],
        body: items,
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      if (pickup.notes) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(`Notes: ${pickup.notes}`, 14, y);
        y += 6;
      }
    }
  }

  // ── Delivery details ──
  if (y > 240) { doc.addPage(); y = 14; }
  y = addSectionTitle(doc, "Delivery Details", y);
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    body: [
      ["Contact", `${job.delivery_contact_name} (${job.delivery_contact_phone})`],
      ["Address", `${job.delivery_address_line1}, ${job.delivery_city}, ${job.delivery_postcode}`],
      ...(job.delivery_company ? [["Company", job.delivery_company]] : []),
      ["Date/Time", delivery ? safeDate(delivery.inspected_at) : "—"],
      ["Odometer", delivery?.odometer != null ? delivery.odometer.toLocaleString("en-GB") : "—"],
      ["Fuel", fuelLabel(delivery?.fuel_level_percent ?? null)],
      ["Driver", delivery?.inspected_by_name || "—"],
      ["Customer", delivery?.customer_name || "—"],
      ["Damages", String(deliveryDamages.length)],
      ["Photos", String(deliveryPhotos.length)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Damage summary ──
  const allDamages = [...pickupDamages, ...deliveryDamages];
  if (allDamages.length > 0) {
    if (y > 240) { doc.addPage(); y = 14; }
    y = addSectionTitle(doc, "Damage Summary", y);
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [33, 37, 41] },
      head: [["Area", "Item", "Type", "Notes"]],
      body: allDamages.map(d => [
        d.area || "—",
        d.item || "—",
        d.damage_types?.join(", ") || "—",
        d.notes || "—",
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Signatures ──
  if (y > 220) { doc.addPage(); y = 14; }
  y = addSectionTitle(doc, "Signatures", y);

  const sigs = [
    { label: `Pickup Driver (${pickup?.inspected_by_name || "—"})`, url: pickup?.driver_signature_url },
    { label: `Pickup Customer (${pickup?.customer_name || "—"})`, url: pickup?.customer_signature_url },
    { label: `Delivery Driver (${delivery?.inspected_by_name || "—"})`, url: delivery?.driver_signature_url },
    { label: `Delivery Customer (${delivery?.customer_name || "—"})`, url: delivery?.customer_signature_url },
  ];

  for (const sig of sigs) {
    if (!sig.url) continue;
    if (y > 260) { doc.addPage(); y = 14; }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(sig.label, 14, y);
    y += 2;
    const imgData = await loadImageAsBase64(sig.url);
    if (imgData) {
      try {
        doc.addImage(imgData, "PNG", 14, y, 60, 20);
        y += 24;
      } catch {
        y += 4;
      }
    } else {
      y += 4;
    }
  }

  // ── Declaration ──
  if (y > 250) { doc.addPage(); y = 14; }
  y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 37, 41);
  doc.text("Customer Declaration", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const decl = "The customer confirms that the above vehicle has been inspected at the point of delivery and any noted damage or exceptions have been recorded on this POD and accompanying imagery.";
  const lines = doc.splitTextToSize(decl, pageWidth - 28);
  doc.text(lines, 14, y);
  y += lines.length * 4 + 6;

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Generated by Axentra Vehicle Logistics", 14, 290);
  doc.text(`Job ${ref} • ${new Date().toLocaleString("en-GB")}`, pageWidth - 14, 290, { align: "right" });

  return doc.output("blob");
}

export async function sharePodPdf(job: JobWithRelations): Promise<void> {
  const blob = await generatePodPdf(job);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const fileName = `AXENTRA_POD_${ref}_${job.vehicle_reg}.pdf`;

  const file = new File([blob], fileName, { type: "application/pdf" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `AXENTRA POD – ${ref} – ${job.vehicle_reg}`,
      files: [file],
    });
  } else {
    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export async function emailPodPdf(job: JobWithRelations): Promise<void> {
  const blob = await generatePodPdf(job);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const fileName = `AXENTRA_POD_${ref}_${job.vehicle_reg}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  const subject = `AXENTRA POD – ${ref} – ${job.vehicle_reg}`;
  const body = `Please find attached the Proof of Delivery for job ${ref} – ${job.vehicle_reg}.`;

  // Try native share with file for email
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: subject,
      text: body,
      files: [file],
    });
  } else {
    // Fallback: download PDF then open mailto
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + "\n\n(PDF downloaded separately – please attach.)")}`;
    window.open(mailto, "_blank");
  }
}
