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

const MARGIN = 20;

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

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 14);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 37, 41);
  doc.text(title, MARGIN, y);
  // Underline
  const tw = doc.getTextWidth(title);
  doc.setDrawColor(33, 37, 41);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, MARGIN + tw, y + 1);
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

/** Try to load the Axentra logo from /axentra-logo.png */
async function loadLogo(): Promise<string | null> {
  try {
    return await loadImageAsBase64("/axentra-logo.png");
  } catch {
    return null;
  }
}

export async function generatePodPdf(job: JobWithRelations): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const pickupDamages = job.damage_items.filter(d => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter(d => delivery && d.inspection_id === delivery.id);
  const pickupPhotos = job.photos.filter(p => p.type.startsWith("pickup_"));
  const deliveryPhotos = job.photos.filter(p => p.type.startsWith("delivery_"));

  // ── Header banner ──
  doc.setFillColor(33, 37, 41);
  doc.rect(0, 0, pageWidth, 30, "F");

  // Logo (top-left)
  const logoData = await loadLogo();
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", MARGIN, 4, 36, 22);
    } catch { /* logo load failed, skip */ }
  }

  // Title (centered)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("AXENTRA VEHICLE LOGISTICS", pageWidth / 2, 12, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Proof of Delivery", pageWidth / 2, 19, { align: "center" });

  // Ref (top-right)
  doc.setFontSize(8);
  doc.text(`Ref: ${ref}`, pageWidth - MARGIN, 12, { align: "right" });
  doc.text(safeDate(job.completed_at || new Date().toISOString()), pageWidth - MARGIN, 18, { align: "right" });

  let y = 38;

  // ── Vehicle Details ──
  y = addSectionTitle(doc, "Vehicle Details", y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, textColor: [80, 80, 80] },
      1: { cellWidth: contentWidth - 48 },
    },
    body: [
      ["Registration", job.vehicle_reg],
      ["Make / Model", `${job.vehicle_make} ${job.vehicle_model}`],
      ["Colour", job.vehicle_colour],
      ...(job.vehicle_year ? [["Year", job.vehicle_year]] : []),
      ["Job Reference", ref],
      ["Route", `${job.pickup_city || "—"} \u2192 ${job.delivery_city || "—"}`],
      ["Collection Status", pickup ? "\u2713 Collected" : "Not collected"],
      ["Delivery Status", delivery ? "\u2713 Delivered" : "Not delivered"],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Expenses Summary ──
  // Expenses are passed via the job object if available – for now we note this section
  // so the PDF structure is complete. The caller can extend JobWithRelations to include expenses.

  // ── Pickup Details ──
  y = addSectionTitle(doc, "Pickup Details", y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, textColor: [80, 80, 80] },
      1: { cellWidth: contentWidth - 48 },
    },
    body: [
      ["Contact", `${job.pickup_contact_name} (${job.pickup_contact_phone})`],
      ["Address", `${job.pickup_address_line1}, ${job.pickup_city}, ${job.pickup_postcode}`],
      ...(job.pickup_company ? [["Company", job.pickup_company]] : []),
      ["Date / Time", pickup ? safeDate(pickup.inspected_at) : "—"],
      ["Odometer", pickup?.odometer != null ? pickup.odometer.toLocaleString("en-GB") : "—"],
      ["Fuel", fuelLabel(pickup?.fuel_level_percent ?? null)],
      ["Driver", pickup?.inspected_by_name || "—"],
      ["Customer", pickup?.customer_name || "—"],
      ["Damages", String(pickupDamages.length)],
      ["Photos", String(pickupPhotos.length)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Pickup Checklist ──
  if (pickup) {
    const items = CHECKLIST_FIELDS
      .filter(f => { const v = pickup[f.key]; return v != null && v !== ""; })
      .map(f => [f.label, String(pickup[f.key])]);

    if (items.length > 0) {
      y = addSectionTitle(doc, "Pickup Checklist", y);
      y = ensureSpace(doc, y, 20);
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        theme: "striped",
        styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
        headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: contentWidth - 60 },
        },
        head: [["Item", "Value"]],
        body: items,
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      if (pickup.notes) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(`Notes: ${pickup.notes}`, MARGIN, y);
        y += 6;
      }
      y += 4;
    }
  }

  // ── Delivery Details ──
  y = addSectionTitle(doc, "Delivery Details", y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, textColor: [80, 80, 80] },
      1: { cellWidth: contentWidth - 48 },
    },
    body: [
      ["Contact", `${job.delivery_contact_name} (${job.delivery_contact_phone})`],
      ["Address", `${job.delivery_address_line1}, ${job.delivery_city}, ${job.delivery_postcode}`],
      ...(job.delivery_company ? [["Company", job.delivery_company]] : []),
      ["Date / Time", delivery ? safeDate(delivery.inspected_at) : "—"],
      ["Odometer", delivery?.odometer != null ? delivery.odometer.toLocaleString("en-GB") : "—"],
      ["Fuel", fuelLabel(delivery?.fuel_level_percent ?? null)],
      ["Driver", delivery?.inspected_by_name || "—"],
      ["Customer", delivery?.customer_name || "—"],
      ["Damages", String(deliveryDamages.length)],
      ["Photos", String(deliveryPhotos.length)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Delivery Checklist ──
  if (delivery) {
    const items = CHECKLIST_FIELDS
      .filter(f => { const v = delivery[f.key]; return v != null && v !== ""; })
      .map(f => [f.label, String(delivery[f.key])]);

    if (items.length > 0) {
      y = addSectionTitle(doc, "Delivery Checklist", y);
      y = ensureSpace(doc, y, 20);
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        theme: "striped",
        styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
        headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: contentWidth - 60 },
        },
        head: [["Item", "Value"]],
        body: items,
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      if (delivery.notes) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(`Notes: ${delivery.notes}`, MARGIN, y);
        y += 6;
      }
      y += 4;
    }
  }

  // ── Damage Summary ──
  const allDamages = [...pickupDamages, ...deliveryDamages];
  if (allDamages.length > 0) {
    y = addSectionTitle(doc, "Damage Summary", y);
    y = ensureSpace(doc, y, 20);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
      headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255] },
      head: [["Area", "Item", "Type", "Notes"]],
      body: allDamages.map(d => [
        d.area || "—",
        d.item || "—",
        d.damage_types?.join(", ") || "—",
        d.notes || "—",
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Signatures (horizontal layout, 4 across) ──
  y = addSectionTitle(doc, "Signatures", y);
  y = ensureSpace(doc, y, 40);

  const sigs = [
    { label: "Pickup Driver", name: pickup?.inspected_by_name || "—", url: pickup?.driver_signature_url },
    { label: "Pickup Customer", name: pickup?.customer_name || "—", url: pickup?.customer_signature_url },
    { label: "Delivery Driver", name: delivery?.inspected_by_name || "—", url: delivery?.driver_signature_url },
    { label: "Delivery Customer", name: delivery?.customer_name || "—", url: delivery?.customer_signature_url },
  ];

  const sigWidth = (contentWidth - 9) / 4; // 3 gaps of 3mm
  let sigX = MARGIN;
  const sigStartY = y;

  for (let i = 0; i < sigs.length; i++) {
    const sig = sigs[i];
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(sig.label, sigX, sigStartY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(sig.name, sigX, sigStartY + 4);

    if (sig.url) {
      const imgData = await loadImageAsBase64(sig.url);
      if (imgData) {
        try {
          // Draw a light border box
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(sigX, sigStartY + 6, sigWidth, 18);
          doc.addImage(imgData, "PNG", sigX + 1, sigStartY + 7, sigWidth - 2, 16);
        } catch { /* skip */ }
      }
    } else {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(sigX, sigStartY + 6, sigWidth, 18);
      doc.setFontSize(7);
      doc.setTextColor(180, 180, 180);
      doc.text("Not signed", sigX + sigWidth / 2, sigStartY + 16, { align: "center" });
    }

    sigX += sigWidth + 3;
  }
  y = sigStartY + 30;

  // ── Declaration ──
  y = ensureSpace(doc, y, 25);
  y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 37, 41);
  doc.text("Customer Declaration", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const decl = "The customer confirms that the above vehicle has been inspected at the point of delivery and any noted damage or exceptions have been recorded on this POD and accompanying imagery.";
  const lines = doc.splitTextToSize(decl, contentWidth);
  doc.text(lines, MARGIN, y);
  y += lines.length * 4 + 8;

  // ── Footer on every page ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by Axentra Vehicle Logistics", MARGIN, 290);
    doc.text(`Job ${ref} \u2022 ${new Date().toLocaleString("en-GB")} \u2022 Page ${p}/${totalPages}`, pageWidth - MARGIN, 290, { align: "right" });
  }

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

  const subject = `Axentra POD – ${ref} – ${job.vehicle_reg}`;
  const body = "Please find attached the Proof of Delivery for the completed job.\n\nKind regards,\nAxentra Vehicle Logistics";

  // Primary: native share with file (works on iOS/Android to open email composer with attachment)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: subject,
        text: body,
        files: [file],
      });
      return;
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      // Fall through to mailto
    }
  }

  // Fallback: open mailto (no attachment possible via mailto, so also download the PDF)
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + "\n\n(The PDF has been downloaded separately – please attach it to this email.)")}`;
  
  try {
    window.location.href = mailto;
  } catch {
    // If mailto fails, alert user
    alert("No email app could be opened. Please check your device settings.");
    return;
  }

  // Download the PDF as a fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
