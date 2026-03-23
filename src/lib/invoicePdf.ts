import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARGIN = 16;
const PAGE_W = 210; // A4 mm

const THEME = {
  navy:        [17, 29, 58]   as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  text:        [40, 40, 48]   as [number, number, number],
  muted:       [110, 115, 125] as [number, number, number],
  lightBorder: [210, 212, 218] as [number, number, number],
  tableStripe: [246, 247, 250] as [number, number, number],
  headerText:  [220, 225, 235] as [number, number, number],
};

const AXENTRA_BANK = {
  bankName: "Monzo",
  accountName: "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics",
  sortCode: "04-00-03",
  accountNumber: "24861835",
} as const;

const LOGO_URL = "/__l5e/assets-v1/f41614c9-47c3-4524-9979-18ec682de972/axentra-logo-dark.png";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  paymentTerms?: string;
  clientName: string;
  clientCompany?: string;
  clientEmail?: string;
  clientAddress?: string;
  lineItems: InvoiceLineItem[];
  notes?: string;
  jobRef?: string;
  vehicleReg?: string;
  route?: string;
  vatRate?: number;
  logoUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  return `£${n.toFixed(2)}`;
}

/** Sanitize text — remove unicode chars jsPDF can't render */
function sanitize(val: string | null | undefined, fb = ""): string {
  const t = String(val ?? "").trim();
  if (!t) return fb;
  return t
    .replace(/[\u2192\u2190\u2194\u21D2]/g, "-")  // arrows
    .replace(/[\u2013\u2014]/g, "-")               // en/em dash
    .replace(/[\u2018\u2019]/g, "'")               // smart quotes
    .replace(/[\u201C\u201D]/g, '"')               // smart double quotes
    .replace(/[\u2026]/g, "...")                    // ellipsis
    .replace(/[^\x00-\x7F]/g, (ch) => {
      // Keep £ sign and common latin chars
      if (ch === "£" || ch === "€") return ch;
      return "";
    });
}

function safe(val: string | null | undefined, fb = "\u2014"): string {
  const t = sanitize(val);
  return t || fb;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function lastY(doc: jsPDF, fb = MARGIN): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fb;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const bottom = doc.internal.pageSize.getHeight() - 12;
  if (y + needed > bottom) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/* ------------------------------------------------------------------ */
/*  Logo loader                                                        */
/* ------------------------------------------------------------------ */

type CachedImage = { dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number };

async function loadImg(url: string): Promise<CachedImage | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    const format = dataUrl.startsWith("data:image/png") ? "PNG" as const : "JPEG" as const;
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = dataUrl;
    });
    return { dataUrl, format, w: img?.width ?? 200, h: img?.height ?? 100 };
  } catch {
    return null;
  }
}

/** Recolor near-black pixels to navy so the logo blends into the banner */
async function recolorToNavy(img: CachedImage): Promise<CachedImage> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.w;
    canvas.height = img.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return img;

    const el = new Image();
    el.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      el.onload = () => resolve();
      el.onerror = () => reject();
      el.src = img.dataUrl;
    });

    ctx.drawImage(el, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const [navyR, navyG, navyB] = THEME.navy;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 35 && d[i + 1] < 35 && d[i + 2] < 35 && d[i + 3] > 100) {
        d[i] = navyR;
        d[i + 1] = navyG;
        d[i + 2] = navyB;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const newDataUrl = canvas.toDataURL("image/png");
    return { dataUrl: newDataUrl, format: "PNG", w: img.w, h: img.h };
  } catch {
    return img;
  }
}

/* ------------------------------------------------------------------ */
/*  1. Header Banner — Premium Seamless                                */
/* ------------------------------------------------------------------ */

function drawHeaderBanner(
  doc: jsPDF,
  data: InvoiceData,
  logo: CachedImage | null,
): number {
  const bannerH = 56;

  // Full-width navy fill
  doc.setFillColor(...THEME.navy);
  doc.rect(0, 0, PAGE_W, bannerH, "F");

  // --- Left side: full logo image (contains icon + AXENTRA + tagline) ---
  if (logo) {
    try {
      const maxLogoH = 46;
      const maxLogoW = 65;
      const scale = Math.min(maxLogoW / logo.w, maxLogoH / logo.h);
      const rw = logo.w * scale;
      const rh = logo.h * scale;
      const logoX = MARGIN;
      const logoY = (bannerH - rh) / 2;
      doc.addImage(logo.dataUrl, logo.format, logoX, logoY, rw, rh);
    } catch { /* graceful fallback */ }
  }

  // --- Right side: INVOICE title ---
  const centerY = bannerH / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...THEME.white);
  doc.text("INVOICE", PAGE_W - MARGIN, centerY - 4, { align: "right" });

  // Invoice number below title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.headerText);
  const invNum = sanitize(data.invoiceNumber, "");
  doc.text(invNum, PAGE_W - MARGIN, centerY + 8, { align: "right" });

  return bannerH + 10;
}

/* ------------------------------------------------------------------ */
/*  2. Meta + Bill To (two side-by-side cards)                         */
/* ------------------------------------------------------------------ */

function drawMetaAndBillTo(doc: jsPDF, data: InvoiceData, y: number): number {
  const contentW = PAGE_W - MARGIN * 2;
  const gap = 8;
  const boxW = (contentW - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + boxW + gap;

  // Determine dynamic height based on content
  const metaLines: Array<[string, string]> = [
    ["Invoice No:", sanitize(data.invoiceNumber)],
    ["Date:", fmtDate(data.issueDate)],
  ];
  if (data.dueDate) metaLines.push(["Due Date:", fmtDate(data.dueDate)]);
  if (data.jobRef) metaLines.push(["Job Ref:", sanitize(data.jobRef)]);

  const clientLines: string[] = [];
  if (data.clientName?.trim()) clientLines.push(data.clientName.trim());
  if (data.clientCompany?.trim()) clientLines.push(data.clientCompany.trim());
  if (data.clientAddress?.trim()) {
    const parts = data.clientAddress.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    clientLines.push(...parts);
  }
  if (data.clientEmail?.trim()) clientLines.push(data.clientEmail.trim());

  const stripH = 8;
  const clientContentH = stripH + 6 + clientLines.length * 5 + 4;
  const metaContentH = 8 + metaLines.length * 7 + 4;
  const boxH = Math.max(metaContentH, clientContentH, 38);

  // --- Left box: Invoice details ---
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.35);
  doc.rect(leftX, y, boxW, boxH);

  let ly = y + 9;
  const labelColX = leftX + 6;
  const valueColX = leftX + 32;

  for (const [label, value] of metaLines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...THEME.text);
    doc.text(label, labelColX, ly);
    doc.setFont("helvetica", "normal");
    doc.text(sanitize(value), valueColX, ly);
    ly += 7;
  }

  // --- Right box: Bill To ---
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.35);
  doc.rect(rightX, y, boxW, boxH);

  // Dark header strip
  doc.setFillColor(...THEME.navy);
  doc.rect(rightX, y, boxW, stripH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.white);
  doc.text("BILL TO", rightX + 6, y + 5.5);

  // Client details
  let ry = y + stripH + 6;
  clientLines.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...THEME.text);
    doc.text(sanitize(line), rightX + 6, ry, { maxWidth: boxW - 12 });
    ry += 5;
  });

  return y + boxH + 10;
}

/* ------------------------------------------------------------------ */
/*  3. Charges Table                                                   */
/* ------------------------------------------------------------------ */

function buildChargesTable(doc: jsPDF, items: InvoiceLineItem[], y: number): number {
  const contentW = PAGE_W - MARGIN * 2;
  const qtyW = 20;
  const rateW = 28;
  const totalW = 30;
  const descW = contentW - qtyW - rateW - totalW;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: THEME.lightBorder,
      lineWidth: 0.3,
      textColor: THEME.text,
    },
    headStyles: {
      fillColor: THEME.navy,
      textColor: THEME.white,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    alternateRowStyles: {
      fillColor: THEME.tableStripe,
    },
    columnStyles: {
      0: { cellWidth: descW },
      1: { cellWidth: qtyW, halign: "center" },
      2: { cellWidth: rateW, halign: "right" },
      3: { cellWidth: totalW, halign: "right" },
    },
    showHead: "everyPage",
    head: [["Description", "Qty", "Rate", "Total"]],
    body: items.map(item => {
      const qty = Number(item.quantity ?? 1);
      const price = Number(item.unitPrice ?? 0);
      return [
        sanitize(item.description, "Line item"),
        String(qty),
        fmt(price),
        fmt(qty * price),
      ];
    }),
    didDrawPage: () => {
      // Optionally re-draw header on new pages if needed
    },
  });

  return lastY(doc) + 8;
}

/* ------------------------------------------------------------------ */
/*  4. Totals Block                                                    */
/* ------------------------------------------------------------------ */

function buildTotalsBlock(doc: jsPDF, data: InvoiceData, y: number): number {
  y = ensureSpace(doc, y, 32);

  const rightEdge = PAGE_W - MARGIN;
  const labelX = rightEdge - 68;

  const subtotal = data.lineItems.reduce(
    (s, item) => s + Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0), 0,
  );
  const vatRate = typeof data.vatRate === "number" ? data.vatRate : 0;
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.text);
  doc.text("Subtotal", labelX, y);
  doc.text(fmt(subtotal), rightEdge, y, { align: "right" });
  y += 6;

  // VAT
  doc.text(`VAT (${vatRate}%)`, labelX, y);
  doc.text(fmt(vatAmount), rightEdge, y, { align: "right" });
  y += 9;

  // Total row — premium navy block
  const totalRowH = 11;
  const totalRowW = 70;
  const totalRowX = rightEdge - totalRowW;
  doc.setFillColor(...THEME.navy);
  doc.roundedRect(totalRowX, y - 6, totalRowW, totalRowH, 1, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...THEME.white);
  doc.text("Total:", totalRowX + 5, y + 1);
  doc.text(fmt(total), rightEdge - 4, y + 1, { align: "right" });

  return y + totalRowH + 10;
}

/* ------------------------------------------------------------------ */
/*  5. Notes (conditional)                                             */
/* ------------------------------------------------------------------ */

function drawNotes(doc: jsPDF, notes: string | undefined, y: number): number {
  if (!notes?.trim()) return y;
  y = ensureSpace(doc, y, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.navy);
  doc.text("Notes", MARGIN, y);

  // Subtle underline
  const tw = doc.getTextWidth("Notes");
  doc.setDrawColor(...THEME.navy);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1.2, MARGIN + tw, y + 1.2);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.text);
  const contentW = PAGE_W - MARGIN * 2;
  const lines = doc.splitTextToSize(sanitize(notes), contentW);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.2 + 8;
}

/* ------------------------------------------------------------------ */
/*  6. Payment Information                                             */
/* ------------------------------------------------------------------ */

function drawPaymentInfo(doc: jsPDF, data: InvoiceData, y: number): number {
  y = ensureSpace(doc, y, 52);

  // Section title with underline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.navy);
  doc.text("Payment Information", MARGIN, y);
  const tw = doc.getTextWidth("Payment Information");
  doc.setDrawColor(...THEME.navy);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1.2, MARGIN + tw, y + 1.2);
  y += 9;

  // Bank details — label: value pairs
  const details: Array<[string, string]> = [
    ["Bank:", AXENTRA_BANK.bankName],
    ["Account Name:", AXENTRA_BANK.accountName],
    ["Sort Code:", AXENTRA_BANK.sortCode],
    ["Account Number:", AXENTRA_BANK.accountNumber],
  ];

  doc.setFontSize(9);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...THEME.text);
    const labelText = `${label} `;
    doc.text(labelText, MARGIN, y);
    const labelW = doc.getTextWidth(labelText);
    doc.setFont("helvetica", "normal");
    doc.text(value, MARGIN + labelW, y);
    y += 5.5;
  }

  y += 3;

  // Reference note — italicized
  const refNote = data.paymentTerms?.trim()
    ? `${sanitize(data.paymentTerms)}. Please use invoice number as payment reference.`
    : "Please use invoice number as payment reference.";

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...THEME.muted);
  const contentW = PAGE_W - MARGIN * 2;
  const lines = doc.splitTextToSize(refNote, contentW);
  doc.text(lines, MARGIN, y);

  return y + lines.length * 3.5 + 8;
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logoSrc = data.logoUrl || LOGO_URL;
  const logo = await loadImg(logoSrc);

  let y = drawHeaderBanner(doc, data, logo);
  y = drawMetaAndBillTo(doc, data, y);
  y = buildChargesTable(doc, data.lineItems, y);
  y = buildTotalsBlock(doc, data, y);
  y = drawNotes(doc, data.notes, y);
  y = drawPaymentInfo(doc, data, y);

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `AXENTRA_INV_${sanitize(data.invoiceNumber, "INVOICE")}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
