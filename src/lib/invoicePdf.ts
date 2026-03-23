import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARGIN = 14;
const PAGE_W = 210; // A4 mm

const THEME = {
  navy:        [17, 29, 58]   as [number, number, number],
  navyDeep:    [12, 20, 45]   as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  text:        [35, 35, 42]   as [number, number, number],
  muted:       [100, 105, 115] as [number, number, number],
  lightBorder: [215, 218, 225] as [number, number, number],
  tableStripe: [248, 249, 252] as [number, number, number],
  headerText:  [180, 190, 210] as [number, number, number],
  accent:      [45, 120, 220]  as [number, number, number],
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
  const bannerH = 44;

  // Subtle depth — darker base then navy overlay
  doc.setFillColor(...THEME.navyDeep);
  doc.rect(0, 0, PAGE_W, bannerH, "F");
  doc.setFillColor(...THEME.navy);
  doc.rect(0, 0, PAGE_W, bannerH, "F");

  // --- Left side: logo image scaled to fill banner height ---
  if (logo) {
    try {
      const padY = 3;
      const maxLogoH = bannerH - padY * 2;
      const maxLogoW = 80;
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
  doc.setFontSize(24);
  doc.setTextColor(...THEME.white);
  doc.text("INVOICE", PAGE_W - MARGIN, centerY - 2, { align: "right" });

  // Invoice number — smaller, muted
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...THEME.headerText);
  const invNum = sanitize(data.invoiceNumber, "");
  doc.text(invNum, PAGE_W - MARGIN, centerY + 6, { align: "right" });

  // Thin accent line at bottom of banner
  doc.setDrawColor(...THEME.accent);
  doc.setLineWidth(0.6);
  doc.line(0, bannerH, PAGE_W, bannerH);

  return bannerH + 8;
}

/* ------------------------------------------------------------------ */
/*  2. Meta + Bill To (two side-by-side cards)                         */
/* ------------------------------------------------------------------ */

function drawMetaAndBillTo(doc: jsPDF, data: InvoiceData, y: number): number {
  const contentW = PAGE_W - MARGIN * 2;
  const gap = 6;
  const boxW = (contentW - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + boxW + gap;
  const radius = 1.5;

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

  const stripH = 7;
  const clientContentH = stripH + 5 + clientLines.length * 4.8 + 4;
  const metaContentH = 7 + metaLines.length * 6.5 + 4;
  const boxH = Math.max(metaContentH, clientContentH, 34);

  // --- Left box: Invoice details (rounded) ---
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.25);
  doc.roundedRect(leftX, y, boxW, boxH, radius, radius);

  let ly = y + 8;
  const labelColX = leftX + 5;
  const valueColX = leftX + 30;

  for (const [label, value] of metaLines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.text);
    doc.text(label, labelColX, ly);
    doc.setFont("helvetica", "normal");
    doc.text(sanitize(value), valueColX, ly);
    ly += 6.5;
  }

  // --- Right box: Bill To (rounded with navy header) ---
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.25);
  doc.roundedRect(rightX, y, boxW, boxH, radius, radius);

  // Dark header strip with clipped top corners
  doc.setFillColor(...THEME.navy);
  doc.roundedRect(rightX, y, boxW, stripH, radius, radius, "F");
  // Fill bottom of strip to square off the corners
  doc.rect(rightX, y + stripH - radius, boxW, radius, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...THEME.white);
  doc.text("BILL TO", rightX + 5, y + 5);

  // Client details
  let ry = y + stripH + 5;
  clientLines.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.text);
    doc.text(sanitize(line), rightX + 5, ry, { maxWidth: boxW - 10 });
    ry += 4.8;
  });

  return y + boxH + 8;
}

/* ------------------------------------------------------------------ */
/*  3. Charges Table                                                   */
/* ------------------------------------------------------------------ */

function buildChargesTable(doc: jsPDF, items: InvoiceLineItem[], y: number): number {
  const contentW = PAGE_W - MARGIN * 2;
  const qtyW = 18;
  const rateW = 26;
  const totalW = 28;
  const descW = contentW - qtyW - rateW - totalW;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: THEME.lightBorder,
      lineWidth: 0.2,
      textColor: THEME.text,
    },
    headStyles: {
      fillColor: THEME.navy,
      textColor: THEME.white,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
    },
    alternateRowStyles: {
      fillColor: THEME.tableStripe,
    },
    columnStyles: {
      0: { cellWidth: descW },
      1: { cellWidth: qtyW, halign: "center" },
      2: { cellWidth: rateW, halign: "right" },
      3: { cellWidth: totalW, halign: "right", fontStyle: "bold" },
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
  });

  return lastY(doc) + 6;
}

/* ------------------------------------------------------------------ */
/*  4. Totals Block                                                    */
/* ------------------------------------------------------------------ */

function buildTotalsBlock(doc: jsPDF, data: InvoiceData, y: number): number {
  y = ensureSpace(doc, y, 30);

  const rightEdge = PAGE_W - MARGIN;
  const labelX = rightEdge - 64;

  const subtotal = data.lineItems.reduce(
    (s, item) => s + Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0), 0,
  );
  const vatRate = typeof data.vatRate === "number" ? data.vatRate : 0;
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  // Thin separator line
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.2);
  doc.line(labelX, y - 2, rightEdge, y - 2);

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...THEME.text);
  doc.text("Subtotal", labelX, y + 2);
  doc.text(fmt(subtotal), rightEdge, y + 2, { align: "right" });
  y += 6;

  // VAT
  doc.text(`VAT (${vatRate}%)`, labelX, y + 2);
  doc.text(fmt(vatAmount), rightEdge, y + 2, { align: "right" });
  y += 8;

  // Total row — navy pill
  const totalRowH = 10;
  const totalRowW = 66;
  const totalRowX = rightEdge - totalRowW;
  doc.setFillColor(...THEME.navy);
  doc.roundedRect(totalRowX, y - 5, totalRowW, totalRowH, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.white);
  doc.text("Total:", totalRowX + 4, y + 1);
  doc.text(fmt(total), rightEdge - 3, y + 1, { align: "right" });

  return y + totalRowH + 8;
}

/* ------------------------------------------------------------------ */
/*  5. Notes (conditional)                                             */
/* ------------------------------------------------------------------ */

function drawNotes(doc: jsPDF, notes: string | undefined, y: number): number {
  if (!notes?.trim()) return y;
  y = ensureSpace(doc, y, 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.navy);
  doc.text("Notes", MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...THEME.text);
  const contentW = PAGE_W - MARGIN * 2;
  const lines = doc.splitTextToSize(sanitize(notes), contentW);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4 + 6;
}

/* ------------------------------------------------------------------ */
/*  6. Payment Information                                             */
/* ------------------------------------------------------------------ */

function drawPaymentInfo(doc: jsPDF, data: InvoiceData, y: number): number {
  y = ensureSpace(doc, y, 46);

  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.navy);
  doc.text("Payment Information", MARGIN, y);
  y += 7;

  // Bank details
  const details: Array<[string, string]> = [
    ["Bank:", AXENTRA_BANK.bankName],
    ["Account Name:", AXENTRA_BANK.accountName],
    ["Sort Code:", AXENTRA_BANK.sortCode],
    ["Account Number:", AXENTRA_BANK.accountNumber],
  ];

  doc.setFontSize(8.5);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...THEME.text);
    const labelText = `${label} `;
    doc.text(labelText, MARGIN, y);
    const labelW = doc.getTextWidth(labelText);
    doc.setFont("helvetica", "normal");
    doc.text(value, MARGIN + labelW, y);
    y += 5;
  }

  y += 2;

  // Reference note
  const refNote = data.paymentTerms?.trim()
    ? `${sanitize(data.paymentTerms)}. Please use invoice number as payment reference.`
    : "Please use invoice number as payment reference.";

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...THEME.muted);
  const contentW = PAGE_W - MARGIN * 2;
  const lines = doc.splitTextToSize(refNote, contentW);
  doc.text(lines, MARGIN, y);

  return y + lines.length * 3.5 + 6;
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logoSrc = data.logoUrl || LOGO_URL;
  let logo = await loadImg(logoSrc);
  if (logo) logo = await recolorToNavy(logo);

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
