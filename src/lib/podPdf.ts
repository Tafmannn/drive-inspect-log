import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";
import { CHECKLIST_FIELDS } from "./inspectionFields";
import { resolveImageUrlAsync } from "./gcsProxyUrl";

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
  const tw = doc.getTextWidth(title);
  doc.setDrawColor(33, 37, 41);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, MARGIN + tw, y + 1);
  return y + 7;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resolvedUrl = await resolveImageUrlAsync(url) ?? url;
    const response = await fetch(resolvedUrl, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
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
}

async function loadLogo(): Promise<string | null> {
  try { return await loadImageAsBase64("/axentra-logo.png"); }
  catch { return null; }
}

async function getPhotoSignedUrl(url: string): Promise<string | null> {
  try {
    const match = url.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/?]+)\/(.+?)(\?|$)/);
    if (!match) return null;
    const [, bucket, path] = match;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(decodeURIComponent(path), 60 * 60 * 24 * 30);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export interface PodExpense {
  id: string;
  category: string;
  label: string | null;
  amount: number;
  billable_on_pod: boolean;
}

export async function generatePodPdf(job: JobWithRelations, expenses?: PodExpense[]): Promise<Blob> {
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

  const allPhotoUrls = [...pickupPhotos, ...deliveryPhotos].map(p => p.url);
  const sigUrls = [
    pickup?.driver_signature_url,
    pickup?.customer_signature_url,
    delivery?.driver_signature_url,
    delivery?.customer_signature_url,
  ].filter(Boolean) as string[];

  const allUrls = [...allPhotoUrls, ...sigUrls];
  const imageCache = new Map<string, string | null>();
  const signedUrlCache = new Map<string, string | null>();

  await Promise.allSettled([
    ...allUrls.map(async (url) => {
      const data = await loadImageAsBase64(url);
      imageCache.set(url, data);
    }),
    ...allPhotoUrls.map(async (url) => {
      const signed = await getPhotoSignedUrl(url);
      signedUrlCache.set(url, signed);
    }),
  ]);

  // Header banner
  doc.setFillColor(33, 37, 41);
  doc.rect(0, 0, pageWidth, 30, "F");
  const logoData = await loadLogo();
  if (logoData) {
    try { doc.addImage(logoData, "PNG", MARGIN, 4, 36, 22); } catch { /* skip */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("AXENTRA VEHICLE LOGISTICS", pageWidth / 2, 12, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Proof of Delivery", pageWidth / 2, 19, { align: "center" });
  doc.setFontSize(8);
  doc.text(`Job ${ref}`, pageWidth - MARGIN, 12, { align: "right" });
  doc.text(safeDate(job.completed_at || new Date().toISOString()), pageWidth - MARGIN, 18, { align: "right" });

  let y = 38;

  // Vehicle Details
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
      ["Job ID", `Job ${ref}`],
      ["Route", `${job.pickup_city || "—"} \u2192 ${job.delivery_city || "—"}`],
      ["Collection Status", pickup ? "\u2713 Collected" : "Not collected"],
      ["Delivery Status", delivery ? "\u2713 Delivered" : "Not delivered"],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Billable Expenses
  const billableExpenses = (expenses ?? []).filter(e => e.billable_on_pod !== false);
  if (billableExpenses.length > 0) {
    y = addSectionTitle(doc, `Billable Expenses (${billableExpenses.length} items)`, y);
    y = ensureSpace(doc, y, 20);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
      headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255] },
      head: [["Category", "Label"]],
      body: billableExpenses.map(e => [e.category, e.label || "—"]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Pickup Details
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

  // Pickup Checklist
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
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: contentWidth - 60 } },
        head: [["Item", "Value"]],
        body: items,
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      if (pickup.notes) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(`Notes: ${​​​​​​​​​​​​​​​​
