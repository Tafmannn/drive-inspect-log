import jsPDF from "jspdf";
import autoTable, { type CellHookData, type RowInput } from "jspdf-autotable";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARGIN = 14;
const PAGE_W = 210; // A4 mm

const THEME = {
  navy:        [17, 29, 58]    as [number, number, number],
  navyDeep:    [12, 20, 45]    as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  text:        [40, 42, 48]    as [number, number, number],
  muted:       [120, 125, 135] as [number, number, number],
  lightBorder: [225, 228, 235] as [number, number, number],
  softBg:      [245, 247, 252] as [number, number, number],
  tableStripe: [250, 251, 254] as [number, number, number],
  headerText:  [200, 210, 230] as [number, number, number],
  accent:      [0, 82, 204]    as [number, number, number],
  accentLight: [230, 240, 255] as [number, number, number],
  sectionTitle:[17, 29, 58]    as [number, number, number],
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
  /** Section heading this line belongs to, e.g. "Transport services" */
  group?: string;
  /** Combined layout: second, muted line under the description (e.g. expense breakdown) */
  detail?: string;
  /** Combined layout: rechargeable expenses for this job, net */
  expenseAmount?: number;
}

export interface ExpenseScheduleRow {
  ref: string;          // R01, R02 ... (matches receipt caption)
  date: string;         // ISO date
  jobRef: string;
  vehicleReg?: string;
  category: string;
  supplier?: string;
  net: number;
  vat: number;
  gross: number;
}

export interface InvoiceBusinessDetails {
  name?: string | null;
  address?: string | null;
  companyNumber?: string | null;
  vatNumber?: string | null;
}

export interface ReceiptImage {
  ref: string;
  caption: string;      // e.g. "JOB-1042 | Fuel | 2 November 2026 | £54.60"
  image: CachedImage | null;
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
  /** Client's own reference / purchase order number */
  clientRef?: string;
  /** Banner sub-line for multi-job invoices, e.g. "7 jobs | 2-12 Nov 2026" */
  headerSubtitle?: string;
  /** Schedule A: itemised rechargeable expenses */
  expenseSchedule?: ExpenseScheduleRow[];
  /** Receipt copies appended after Schedule A */
  receipts?: ReceiptImage[];
  footerName?: string;
  /** Supplier's legal identity, printed in the footer of every page. */
  business?: InvoiceBusinessDetails;
  /** "credit_note" retitles the document and labels the total as a credit. */
  documentType?: "invoice" | "credit_note";
  /** Receipt copies per page: 2 (large), 4 or 6 (compact). Default 2. */
  receiptsPerPage?: 2 | 4 | 6;
  /**
   * VAT switch. false = not VAT registered: no VAT lines anywhere, expenses
   * recharged at the gross amount paid, Schedule A omitted (job rows + receipt
   * captions carry the detail). Default true (legacy behaviour).
   */
  vatRegistered?: boolean;
  /** Payment details beside the totals instead of below (saves ~45mm). */
  compactFooter?: boolean;
}

function vatOn(data: InvoiceData): boolean {
  return data.vatRegistered !== false;
}

function isCreditNote(data: InvoiceData): boolean {
  return data.documentType === "credit_note";
}

function docLabel(data: InvoiceData): string {
  return isCreditNote(data) ? "CREDIT NOTE" : "INVOICE";
}

/** Combined (transport | expenses | total) columns only when something is actually recharged. */
function isCombined(data: InvoiceData): boolean {
  return data.lineItems.some((i) => Number(i.expenseAmount ?? 0) !== 0);
}

function lineTotal(i: InvoiceLineItem): number {
  return Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0) + Number(i.expenseAmount ?? 0);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/** Draws the slim header on overflow pages; set per document in generateInvoicePdf */
let continuationHeader: ((doc: jsPDF) => number) | null = null;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const bottom = doc.internal.pageSize.getHeight() - 16;
  if (y + needed > bottom) {
    doc.addPage();
    return continuationHeader ? continuationHeader(doc) : MARGIN;
  }
  return y;
}

/* ------------------------------------------------------------------ */
/*  Logo loader                                                        */
/* ------------------------------------------------------------------ */

export type CachedImage = { dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number };

export async function loadImg(url: string): Promise<CachedImage | null> {
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
  const bannerH = 46;

  // Solid navy banner
  doc.setFillColor(...THEME.navy);
  doc.rect(0, 0, PAGE_W, bannerH, "F");

  // --- Left side: logo at ~45% of content width ---
  const contentW = PAGE_W - MARGIN * 2;
  if (logo) {
    try {
      const padY = 2;
      const maxLogoH = bannerH - padY * 2;
      const maxLogoW = contentW * 0.48; // ~45-48% of content width
      const scale = Math.min(maxLogoW / logo.w, maxLogoH / logo.h);
      const rw = logo.w * scale;
      const rh = logo.h * scale;
      const logoX = MARGIN;
      const logoY = (bannerH - rh) / 2;
      doc.addImage(logo.dataUrl, logo.format, logoX, logoY, rw, rh);
    } catch { /* graceful fallback */ }
  }

  // --- Right side: INVOICE title + prominent number ---
  const centerY = bannerH / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isCreditNote(data) ? 22 : 26);
  doc.setTextColor(...THEME.white);
  doc.text(docLabel(data), PAGE_W - MARGIN, centerY - 4, { align: "right" });

  // Invoice number — prominent white, not muted
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const invNum = sanitize(data.invoiceNumber, "");
  doc.text(invNum, PAGE_W - MARGIN, centerY + 6, { align: "right" });

  // Job ref or job count underneath
  if (data.headerSubtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...THEME.headerText);
    doc.text(sanitize(data.headerSubtitle), PAGE_W - MARGIN, centerY + 12, { align: "right" });
  } else if (data.jobRef) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...THEME.headerText);
    var refLabel = "Ref: " + sanitize(data.jobRef);
    doc.text(refLabel, PAGE_W - MARGIN, centerY + 12, { align: "right" });
  } else if (data.lineItems.length > 1) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...THEME.headerText);
    doc.text(String(data.lineItems.length) + " items", PAGE_W - MARGIN, centerY + 12, { align: "right" });
  }

  // Accent line at bottom
  doc.setDrawColor(...THEME.accent);
  doc.setLineWidth(0.8);
  doc.line(0, bannerH, PAGE_W, bannerH);

  return bannerH + 8;
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
  const radius = 2;

  // Determine dynamic height based on content
  const metaLines: Array<[string, string]> = [
    [isCreditNote(data) ? "Credit Note No:" : "Invoice No:", sanitize(data.invoiceNumber)],
    ["Date:", fmtDate(data.issueDate)],
  ];
  if (data.dueDate) metaLines.push(["Due Date:", fmtDate(data.dueDate)]);
  if (data.jobRef) metaLines.push(["Job Ref:", sanitize(data.jobRef)]);
  if (data.clientRef) metaLines.push(["Your Ref / PO:", sanitize(data.clientRef)]);

  const clientLines: string[] = [];
  if (data.clientName?.trim()) clientLines.push(data.clientName.trim());
  if (data.clientCompany?.trim()) clientLines.push(data.clientCompany.trim());
  if (data.clientAddress?.trim()) {
    const parts = data.clientAddress.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    clientLines.push(...parts);
  }
  if (data.clientEmail?.trim()) clientLines.push(data.clientEmail.trim());

  const stripH = 7.5;
  const clientContentH = stripH + 6 + clientLines.length * 5 + 5;
  const metaContentH = stripH + 6 + metaLines.length * 6.5 + 5;
  const boxH = Math.max(metaContentH, clientContentH, 36);

  // --- Left box: Invoice details with header strip ---
  doc.setFillColor(...THEME.softBg);
  doc.roundedRect(leftX, y, boxW, boxH, radius, radius, "F");
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, boxW, boxH, radius, radius);

  // Header strip
  doc.setFillColor(...THEME.accent);
  doc.roundedRect(leftX, y, boxW, stripH, radius, radius, "F");
  doc.rect(leftX, y + stripH - radius, boxW, radius, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...THEME.white);
  doc.text(isCreditNote(data) ? "CREDIT NOTE DETAILS" : "INVOICE DETAILS", leftX + 5, y + 5.2);

  let ly = y + stripH + 6;
  const labelColX = leftX + 6;
  const valueColX = leftX + 34;

  for (const [label, value] of metaLines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...THEME.muted);
    doc.text(label, labelColX, ly);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.text);
    doc.text(sanitize(value), valueColX, ly);
    ly += 6.5;
  }

  // --- Right box: Bill To ---
  doc.setFillColor(...THEME.softBg);
  doc.roundedRect(rightX, y, boxW, boxH, radius, radius, "F");
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightX, y, boxW, boxH, radius, radius);

  // Header strip
  doc.setFillColor(...THEME.navy);
  doc.roundedRect(rightX, y, boxW, stripH, radius, radius, "F");
  doc.rect(rightX, y + stripH - radius, boxW, radius, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...THEME.white);
  doc.text("BILL TO", rightX + 5, y + 5.2);

  // Client details
  let ry = y + stripH + 6;
  clientLines.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.text);
    doc.text(sanitize(line), rightX + 6, ry, { maxWidth: boxW - 12 });
    ry += 5;
  });

  return y + boxH + 10;
}

/* ------------------------------------------------------------------ */
/*  3. Charges Table                                                   */
/* ------------------------------------------------------------------ */

/** A body cell whose trailing lines are the muted expense detail, drawn separately. */
type DetailCell = CellHookData["cell"] & { __detail?: string[]; __mainLines?: number };

/** One row per job: description + muted expense line | transport | expenses | total */
function buildCombinedTable(doc: jsPDF, data: InvoiceData, y: number): number {
  const items = data.lineItems;
  const startPage = doc.getCurrentPageInfo().pageNumber;
  const contentW = PAGE_W - MARGIN * 2;
  const moneyW = 23;
  const totalW = 25;
  const descW = contentW - moneyW * 2 - totalW;
  // How many wrapped lines each row's muted detail takes (measured at its own font size)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const detailLineCounts = items.map((i) =>
    i.detail ? (doc.splitTextToSize(sanitize(i.detail), descW - 10) as string[]).length : 0,
  );

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: CONT_BANNER_H + 8, bottom: 16 },
    didDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber > startPage) {
        drawContinuationHeader(doc, data, "Invoice continued");
      }
    },
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.6, bottom: 2.6, left: 5, right: 5 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: THEME.lightBorder,
      lineWidth: 0.15,
      textColor: THEME.text,
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: THEME.navy,
      textColor: THEME.white,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      overflow: "visible",
    },
    alternateRowStyles: { fillColor: THEME.tableStripe },
    columnStyles: {
      0: { cellWidth: descW },
      1: { cellWidth: moneyW, halign: "right", cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 4 } },
      2: { cellWidth: moneyW, halign: "right", cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 4 } },
      3: { cellWidth: totalW, halign: "right", fontStyle: "bold" },
    },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    head: [["JOB / DESCRIPTION", "TRANSPORT", "EXPENSES", "TOTAL"]],
    body: items.map((item) => {
      const transport = Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0);
      const exp = Number(item.expenseAmount ?? 0);
      const desc = sanitize(item.description, "Line item");
      return [
        item.detail ? desc + "\n" + sanitize(item.detail) : desc,
        fmt(transport),
        exp > 0 ? fmt(exp) : "-",
        fmt(transport + exp),
      ];
    }),
    // Draw the detail line smaller and muted (height is already reserved)
    willDrawCell: (h: CellHookData) => {
      const n = h.section === "body" && h.column.index === 0 ? detailLineCounts[h.row.index] : 0;
      if (n > 0 && h.cell.text.length > n) {
        const cell = h.cell as DetailCell;
        cell.__detail = h.cell.text.slice(h.cell.text.length - n);
        cell.__mainLines = h.cell.text.length - n;
        h.cell.text = h.cell.text.slice(0, h.cell.text.length - n);
        h.cell.styles.valign = "top";
      }
      if (h.section === "body" && h.column.index === 2 && h.cell.raw === "-") {
        h.doc.setTextColor(...THEME.muted);
      }
    },
    didDrawCell: (h: CellHookData) => {
      const cell = h.cell as DetailCell;
      const detail = cell.__detail;
      if (!detail) return;
      h.doc.setFont("helvetica", "normal");
      h.doc.setFontSize(7.5);
      h.doc.setTextColor(...THEME.muted);
      const x = h.cell.x + 5;
      const y0 = h.cell.y + 2.6 + 3.6 + ((cell.__mainLines ?? 1) - 1) * 3.6 + 3.9;
      detail.forEach((line: string, i: number) => h.doc.text(line, x, y0 + i * 3.4));
    },
  });

  return lastY(doc) + 8;
}

function buildChargesTable(doc: jsPDF, data: InvoiceData, y: number): number {
  if (isCombined(data)) return buildCombinedTable(doc, data, y);
  var items = data.lineItems;
  var startPage = doc.getCurrentPageInfo().pageNumber;
  var contentW = PAGE_W - MARGIN * 2;
  var qtyW = 18;
  var rateW = 26;
  var totalW = 28;
  var descW = contentW - qtyW - rateW - totalW;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: CONT_BANNER_H + 8, bottom: 16 },
    didDrawPage: function() {
      // Long multi-job invoices: give overflow pages the slim header
      if (doc.getCurrentPageInfo().pageNumber > startPage) {
        drawContinuationHeader(doc, data, "Invoice continued");
      }
    },
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: THEME.lightBorder,
      lineWidth: 0.15,
      textColor: THEME.text,
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: THEME.navy,
      textColor: THEME.white,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    alternateRowStyles: {
      fillColor: THEME.tableStripe,
    },
    bodyStyles: {
      lineColor: THEME.lightBorder,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: descW },
      1: { cellWidth: qtyW, halign: "center" },
      2: { cellWidth: rateW, halign: "right" },
      3: { cellWidth: totalW, halign: "right", fontStyle: "bold" },
    },
    showHead: "everyPage",
    head: [["DESCRIPTION", "QTY", "RATE", "TOTAL"]],
    body: (function() {
      var rows: RowInput[] = [];
      var current: string | undefined = undefined;
      items.forEach(function(item) {
        if (item.group && item.group !== current) {
          current = item.group;
          rows.push([{
            content: sanitize(item.group).toUpperCase(),
            colSpan: 4,
            styles: {
              fillColor: THEME.accentLight,
              textColor: THEME.sectionTitle,
              fontStyle: "bold",
              fontSize: 7.5,
              cellPadding: { top: 2.5, bottom: 2.5, left: 5, right: 5 },
              minCellHeight: 6,
            },
          }]);
        }
        var qty = Number(item.quantity ?? 1);
        var price = Number(item.unitPrice ?? 0);
        rows.push([
          sanitize(item.description, "Line item"),
          String(qty),
          fmt(price),
          fmt(qty * price),
        ]);
      });
      return rows;
    })(),
  });

  return lastY(doc) + 8;
}

/* ------------------------------------------------------------------ */
/*  4. Totals Block                                                    */
/* ------------------------------------------------------------------ */

function totalsHeight(data: InvoiceData): number {
  const combined = isCombined(data);
  const groups = new Set(data.lineItems.map((i) => i.group).filter(Boolean));
  const sections = combined ? 2 : groups.size > 1 ? groups.size : 0;
  return (vatOn(data) ? 34 : 22) + (sections ? sections * 6.5 + 2 : 0);
}

function buildTotalsBlock(doc: jsPDF, data: InvoiceData, y: number, skipSpaceCheck = false): number {
  const groups: string[] = [];
  data.lineItems.forEach((i) => { if (i.group && !groups.includes(i.group)) groups.push(i.group); });
  const combined = isCombined(data);
  const sectionRows: Array<[string, number]> = combined
    ? [
        ["Transport services", data.lineItems.reduce((s, i) => s + Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0), 0)],
        [vatOn(data) && data.expenseSchedule?.length ? "Rechargeable expenses (Schedule A)" : "Rechargeable expenses", data.lineItems.reduce((s, i) => s + Number(i.expenseAmount ?? 0), 0)],
      ]
    : groups.length > 1
      ? groups.map((g) => [g, data.lineItems.filter((i) => i.group === g).reduce((s, i) => s + lineTotal(i), 0)] as [string, number])
      : [];
  if (!skipSpaceCheck) y = ensureSpace(doc, y, totalsHeight(data));

  const rightEdge = PAGE_W - MARGIN;
  const blockW = 72;
  const labelX = rightEdge - blockW;

  const subtotal = data.lineItems.reduce((s, item) => s + lineTotal(item), 0);
  const vatRate = vatOn(data) && typeof data.vatRate === "number" ? data.vatRate : 0;
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  // Per-section subtotals (only when the invoice has more than one section)
  if (sectionRows.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    for (const [g, gt] of sectionRows) {
      doc.setTextColor(...THEME.muted);
      doc.text(sanitize(g), labelX, y + 2);
      doc.setTextColor(...THEME.text);
      doc.text(fmt(gt), rightEdge, y + 2, { align: "right" });
      y += 6.5;
    }
    doc.setDrawColor(...THEME.lightBorder);
    doc.setLineWidth(0.2);
    doc.line(labelX, y - 1.5, rightEdge, y - 1.5);
    y += 2;
  }

  if (vatOn(data)) {
    // Subtotal
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.muted);
    doc.text("Subtotal", labelX, y + 2);
    doc.setTextColor(...THEME.text);
    doc.text(fmt(subtotal), rightEdge, y + 2, { align: "right" });
    y += 6.5;

    // VAT
    doc.setTextColor(...THEME.muted);
    doc.text(`VAT (${vatRate}%)`, labelX, y + 2);
    doc.setTextColor(...THEME.text);
    doc.text(fmt(vatAmount), rightEdge, y + 2, { align: "right" });
    y += 7;

    // Separator
    doc.setDrawColor(...THEME.lightBorder);
    doc.setLineWidth(0.3);
    doc.line(labelX, y - 1, rightEdge, y - 1);
    y += 3;
  } else {
    y += 3;
  }

  // Total row — navy rounded pill
  const totalRowH = 11;
  const totalRowX = labelX;
  doc.setFillColor(...THEME.navy);
  doc.roundedRect(totalRowX, y - 5, blockW, totalRowH, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...THEME.white);
  doc.text(isCreditNote(data) ? "TOTAL CREDIT" : vatOn(data) ? "TOTAL" : "TOTAL DUE", totalRowX + 5, y + 1.5);
  doc.text(fmt(total), rightEdge - 4, y + 1.5, { align: "right" });

  if (!vatOn(data)) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...THEME.muted);
    doc.text("Not registered for VAT - no VAT charged.", rightEdge, y + totalRowH + 1, { align: "right" });
    return y + totalRowH + 6;
  }
  return y + totalRowH + 10;
}

/* ------------------------------------------------------------------ */
/*  5. Notes (conditional)                                             */
/* ------------------------------------------------------------------ */

function drawNotes(doc: jsPDF, notes: string | undefined, y: number): number {
  if (!notes?.trim()) return y;
  y = ensureSpace(doc, y, 20);

  // Light background card for notes
  const contentW = PAGE_W - MARGIN * 2;
  const noteText = sanitize(notes);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(noteText, contentW - 12);
  const cardH = 10 + lines.length * 4 + 4;

  doc.setFillColor(...THEME.softBg);
  doc.roundedRect(MARGIN, y - 2, contentW, cardH, 2, 2, "F");
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y - 2, contentW, cardH, 2, 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...THEME.sectionTitle);
  doc.text("NOTES", MARGIN + 6, y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...THEME.text);
  doc.text(lines, MARGIN + 6, y + 10);

  return y + cardH + 6;
}

/* ------------------------------------------------------------------ */
/*  6. Payment Information                                             */
/* ------------------------------------------------------------------ */

function paymentRefNote(data: InvoiceData): string {
  return data.paymentTerms?.trim()
    ? `${sanitize(data.paymentTerms)}. Please use invoice number as payment reference.`
    : "Please use invoice number as payment reference.";
}

/** Card height incl. wrapped values and reference note, so callers can reserve space */
function paymentInfoHeight(doc: jsPDF, data: InvoiceData, contentW: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  let h = 10;
  for (const [label, value] of paymentDetails()) {
    doc.setFont("helvetica", "bold");
    const labelW = doc.getTextWidth(`${label} `);
    doc.setFont("helvetica", "normal");
    const n = (doc.splitTextToSize(value, contentW - 14 - labelW) as string[]).length;
    h += 5.5 + (n - 1) * 4;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  const refN = (doc.splitTextToSize(paymentRefNote(data), contentW - 14) as string[]).length;
  return h + 2 + refN * 3.5 + 3;
}

function paymentDetails(): Array<[string, string]> {
  return [
    ["Bank:", AXENTRA_BANK.bankName],
    ["Account Name:", AXENTRA_BANK.accountName],
    ["Sort Code:", AXENTRA_BANK.sortCode],
    ["Account Number:", AXENTRA_BANK.accountNumber],
  ];
}

function drawPaymentInfo(
  doc: jsPDF,
  data: InvoiceData,
  y: number,
  x: number = MARGIN,
  contentW: number = PAGE_W - MARGIN * 2,
  skipSpaceCheck = false,
): number {
  if (!skipSpaceCheck) y = ensureSpace(doc, y, 50);
  const MARGIN_X = x;

  // Payment card with accent left border
  const details = paymentDetails();
  const cardH = paymentInfoHeight(doc, data, contentW);

  // Card background
  doc.setFillColor(...THEME.softBg);
  doc.roundedRect(MARGIN_X, y - 2, contentW, cardH, 2, 2, "F");
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN_X, y - 2, contentW, cardH, 2, 2);

  // Accent left border
  doc.setFillColor(...THEME.accent);
  doc.rect(MARGIN_X, y - 2, 1.2, cardH, "F");

  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...THEME.sectionTitle);
  doc.text("PAYMENT INFORMATION", MARGIN_X + 7, y + 4);
  y += 10;

  // Bank details
  doc.setFontSize(8.5);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...THEME.muted);
    doc.text(label, MARGIN_X + 7, y);
    const labelW = doc.getTextWidth(`${label} `);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...THEME.text);
    const vLines = doc.splitTextToSize(value, contentW - 14 - labelW) as string[];
    doc.text(vLines, MARGIN_X + 7 + labelW, y);
    y += 5.5 + (vLines.length - 1) * 4;
  }

  y += 2;

  // Reference note
  const refNote = paymentRefNote(data);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...THEME.muted);
  const lines = doc.splitTextToSize(refNote, contentW - 14);
  doc.text(lines, MARGIN_X + 7, y);

  return y + lines.length * 3.5 + 8;
}

/** Compact layout: notes as a short muted line directly under the table */
function drawCompactNote(doc: jsPDF, notes: string | undefined, y: number): number {
  if (!notes?.trim()) return y;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...THEME.muted);
  const lines = doc.splitTextToSize(sanitize(notes), PAGE_W - MARGIN * 2) as string[];
  doc.text(lines, MARGIN, y - 3);
  return y - 3 + lines.length * 3.6 + 4;
}

/* ------------------------------------------------------------------ */
/*  6b. Compact footer: payment details beside the totals              */
/* ------------------------------------------------------------------ */

function drawTotalsAndPaymentSideBySide(doc: jsPDF, data: InvoiceData, y: number): number {
  const contentW = PAGE_W - MARGIN * 2;
  const totalsW = 72;
  const gap = 10;
  const payW = contentW - totalsW - gap;
  const payH = paymentInfoHeight(doc, data, payW);
  y = ensureSpace(doc, y, Math.max(totalsHeight(data), payH) + 2);
  const yTotals = buildTotalsBlock(doc, data, y, true);
  const yPay = drawPaymentInfo(doc, data, y + 2, MARGIN, payW, true);
  return Math.max(yTotals, yPay);
}

/* ------------------------------------------------------------------ */
/*  7. Continuation header (Schedule A / receipt pages)                */
/* ------------------------------------------------------------------ */

const CONT_BANNER_H = 16;

function drawContinuationHeader(doc: jsPDF, data: InvoiceData, title: string): number {
  doc.setFillColor(...THEME.navy);
  doc.rect(0, 0, PAGE_W, CONT_BANNER_H, "F");
  doc.setDrawColor(...THEME.accent);
  doc.setLineWidth(0.8);
  doc.line(0, CONT_BANNER_H, PAGE_W, CONT_BANNER_H);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.white);
  doc.text(docLabel(data) + " " + sanitize(data.invoiceNumber), MARGIN, CONT_BANNER_H / 2 + 1.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...THEME.headerText);
  doc.text(sanitize(title).toUpperCase(), PAGE_W - MARGIN, CONT_BANNER_H / 2 + 1.5, { align: "right" });
  return CONT_BANNER_H + 8;
}

/* ------------------------------------------------------------------ */
/*  8. Schedule A - itemised rechargeable expenses                     */
/* ------------------------------------------------------------------ */

const SCHEDULE_TITLE = "Schedule A - Rechargeable Expenses";

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function drawExpenseSchedule(doc: jsPDF, data: InvoiceData): void {
  const rows = data.expenseSchedule ?? [];
  if (!rows.length || !vatOn(data)) return;

  doc.addPage();
  let y = drawContinuationHeader(doc, data, SCHEDULE_TITLE);

  // Intro line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...THEME.text);
  const intro = "Itemised breakdown of the rechargeable expenses on this invoice. " +
    "Each reference (R01, R02 ...) matches a receipt copy on the pages that follow.";
  const introLines = doc.splitTextToSize(intro, PAGE_W - MARGIN * 2);
  doc.text(introLines, MARGIN, y);
  y += introLines.length * 4 + 4;

  const sum = (k: "net" | "vat" | "gross") => rows.reduce((s, r) => s + r[k], 0);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: CONT_BANNER_H + 8, bottom: 16 },
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: THEME.lightBorder,
      lineWidth: 0.15,
      textColor: THEME.text,
    },
    headStyles: {
      fillColor: THEME.navy,
      textColor: THEME.white,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: THEME.tableStripe },
    footStyles: {
      fillColor: THEME.accentLight,
      textColor: THEME.sectionTitle,
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 11, fontStyle: "bold" },
      1: { cellWidth: 20 },
      2: { cellWidth: 21 },
      3: { cellWidth: 21 },
      4: { cellWidth: 26 },
      5: { cellWidth: "auto" },
      6: { cellWidth: 17, halign: "right" },
      7: { cellWidth: 15, halign: "right" },
      8: { cellWidth: 18, halign: "right", fontStyle: "bold" },
    },
    showHead: "everyPage",
    showFoot: "lastPage",
    head: [["REF", "DATE", "JOB", "VEHICLE", "CATEGORY", "SUPPLIER", "NET", "VAT", "GROSS"]],
    body: rows.map((r) => [
      sanitize(r.ref),
      shortDate(r.date),
      sanitize(r.jobRef),
      safe(r.vehicleReg, "-"),
      sanitize(r.category),
      safe(r.supplier, "-"),
      fmt(r.net),
      fmt(r.vat),
      fmt(r.gross),
    ]),
    foot: [[
      { content: "TOTAL (" + rows.length + " receipts)", colSpan: 6 },
      { content: fmt(sum("net")), styles: { halign: "right" } },
      { content: fmt(sum("vat")), styles: { halign: "right" } },
      { content: fmt(sum("gross")), styles: { halign: "right" } },
    ]],
    didDrawPage: () => {
      // Repeat the slim header if the schedule spills onto another page
      if (doc.getCurrentPageInfo().pageNumber > 1) {
        drawContinuationHeader(doc, data, SCHEDULE_TITLE);
      }
    },
  });

  // Category summary - ties back to the expense lines on page 1
  y = lastY(doc) + 8;
  const cats: string[] = [];
  rows.forEach((r) => { if (!cats.includes(r.category)) cats.push(r.category); });
  y = ensureSpace(doc, y, 14 + cats.length * 6 + 18);

  const blockW = 92;
  const rightEdge = PAGE_W - MARGIN;
  const labelX = rightEdge - blockW;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...THEME.sectionTitle);
  doc.text("SUMMARY BY CATEGORY (NET)", labelX, y);
  y += 6;

  doc.setFontSize(8.5);
  for (const c of cats) {
    const items = rows.filter((r) => r.category === c);
    const net = items.reduce((s, r) => s + r.net, 0);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...THEME.muted);
    doc.text(sanitize(c) + " (" + items.length + ")", labelX, y);
    doc.setTextColor(...THEME.text);
    doc.text(fmt(net), rightEdge, y, { align: "right" });
    y += 6;
  }
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.3);
  doc.line(labelX, y - 2, rightEdge, y - 2);
  y += 3;

  doc.setFillColor(...THEME.navy);
  doc.roundedRect(labelX, y - 5, blockW, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.white);
  doc.text("Carried to invoice", labelX + 5, y + 1.3);
  doc.text(fmt(sum("net")), rightEdge - 4, y + 1.3, { align: "right" });
  y += 12;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...THEME.muted);
  doc.text(
    "Expenses are recharged at cost, net of any VAT reclaimed. VAT is then applied on the invoice total.",
    labelX + blockW, y, { align: "right", maxWidth: 120 },
  );
}

/* ------------------------------------------------------------------ */
/*  9. Receipt copies - two per page                                   */
/* ------------------------------------------------------------------ */

/** A receipt much taller than it is wide (long till roll) needs a full-height slot to stay legible. */
const TALL_RECEIPT_RATIO = 2;

function isTallReceipt(r: ReceiptImage): boolean {
  return !!r.image && r.image.w > 0 && r.image.h / r.image.w > TALL_RECEIPT_RATIO;
}

function drawReceiptGrid(
  doc: jsPDF,
  data: InvoiceData,
  receipts: ReceiptImage[],
  cols: number,
  rows: number,
): void {
  if (!receipts.length) return;
  const pageH = doc.internal.pageSize.getHeight();
  const top = CONT_BANNER_H + 8;
  const bottom = pageH - 16;
  const gap = 8;
  const perPage = cols * rows;
  const slotH = (bottom - top - (rows - 1) * gap) / rows;
  const contentW = (PAGE_W - MARGIN * 2 - (cols - 1) * gap) / cols;
  const capH = 8;

  receipts.forEach((r, i) => {
    const slot = i % perPage;
    if (slot === 0) {
      doc.addPage();
      drawContinuationHeader(doc, data, "Receipt copies");
    }
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const y = top + row * (slotH + gap);
    const x0 = MARGIN + col * (contentW + gap);

    // Card
    doc.setFillColor(...THEME.softBg);
    doc.roundedRect(x0, y, contentW, slotH, 2, 2, "F");
    doc.setDrawColor(...THEME.lightBorder);
    doc.setLineWidth(0.3);
    doc.roundedRect(x0, y, contentW, slotH, 2, 2);

    // Caption strip
    doc.setFillColor(...THEME.navy);
    doc.roundedRect(x0, y, contentW, capH, 2, 2, "F");
    doc.rect(x0, y + capH - 2, contentW, 2, "F");
    doc.setFillColor(...THEME.accent);
    doc.roundedRect(x0, y, 16, capH, 2, 2, "F");
    doc.rect(x0 + 2, y, 14, capH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...THEME.white);
    doc.text(sanitize(r.ref), x0 + 8, y + 5.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(cols === 1 ? 8 : cols === 2 ? 6.8 : 5.6);
    const caption = doc.splitTextToSize(sanitize(r.caption), contentW - 22) as string[];
    doc.text(caption[0] ?? "", x0 + 20, y + 5.5);

    // Image, fitted and centred
    const boxX = x0 + 6;
    const boxY = y + capH + 4;
    const boxW = contentW - 12;
    const boxH = slotH - capH - 8;
    let drawn = false;
    if (r.image) {
      const scale = Math.min(boxW / r.image.w, boxH / r.image.h);
      const w = r.image.w * scale;
      const h = r.image.h * scale;
      try {
        doc.addImage(r.image.dataUrl, r.image.format, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
        drawn = true;
      } catch { /* fall through to placeholder */ }
    }
    if (!drawn) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...THEME.muted);
      doc.text(
        doc.splitTextToSize("Receipt image unavailable - original held on file.", boxW) as string[],
        x0 + contentW / 2, boxY + boxH / 2, { align: "center" },
      );
    }
  });
}

function drawReceiptPages(doc: jsPDF, data: InvoiceData): void {
  const receipts = data.receipts ?? [];
  if (!receipts.length) return;

  const perPage = data.receiptsPerPage === 6 ? 6 : data.receiptsPerPage === 4 ? 4 : 2;
  const cols = perPage === 2 ? 1 : 2;

  // Normal receipts share the standard grid; long till rolls get three
  // full-height columns per page so they are not shrunk to a sliver.
  drawReceiptGrid(doc, data, receipts.filter((r) => !isTallReceipt(r)), cols, perPage / cols);
  drawReceiptGrid(doc, data, receipts.filter(isTallReceipt), 3, 1);
}

/* ------------------------------------------------------------------ */
/*  10. Footer on every page                                           */
/* ------------------------------------------------------------------ */

/** "Name | Address | Company no. 123 | VAT no. GB..." - only the parts that are set. */
export function businessFooterLine(b: InvoiceBusinessDetails | undefined): string {
  if (!b) return "";
  const parts = [
    b.name?.trim(),
    b.address?.replace(/\s*\n\s*/g, ", ").trim(),
    b.companyNumber?.trim() ? "Company no. " + b.companyNumber.trim() : "",
    b.vatNumber?.trim() ? "VAT no. " + b.vatNumber.trim() : "",
  ];
  return parts.filter(Boolean).join("  |  ");
}

function drawFooters(doc: jsPDF, data: InvoiceData): void {
  const n = doc.getNumberOfPages();
  const business = businessFooterLine(data.business);
  // A single-page invoice with no business details stays exactly as before.
  if (n < 2 && !business) return;
  const pageH = doc.internal.pageSize.getHeight();
  const pageLabel =
    (isCreditNote(data) ? "Credit note " : "Invoice ") + sanitize(data.invoiceNumber) +
    (n > 1 ? "  |  Page " : "") ;
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...THEME.lightBorder);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageH - 10, PAGE_W - MARGIN, pageH - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...THEME.muted);
    const right = n > 1 ? pageLabel + i + " of " + n : pageLabel;
    const rightW = doc.getTextWidth(right);
    doc.text(right, PAGE_W - MARGIN, pageH - 6, { align: "right" });
    const left = sanitize(business || data.footerName || "");
    if (left) {
      const maxW = PAGE_W - MARGIN * 2 - rightW - 6;
      const lines = doc.splitTextToSize(left, maxW) as string[];
      doc.text(lines.slice(0, 2), MARGIN, pageH - 6 - (Math.min(lines.length, 2) - 1) * 1.4);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logoSrc = data.logoUrl || LOGO_URL;
  let logo = await loadImg(logoSrc);
  if (logo) logo = await recolorToNavy(logo);

  continuationHeader = (d) => drawContinuationHeader(d, data, "Invoice continued");
  let y = drawHeaderBanner(doc, data, logo);
  y = drawMetaAndBillTo(doc, data, y);
  y = buildChargesTable(doc, data, y);
  if (isCreditNote(data)) {
    // A credit note asks for no payment: totals and the reason only.
    y = buildTotalsBlock(doc, data, y);
    y = drawNotes(doc, data.notes, y);
  } else if (data.compactFooter) {
    y = drawCompactNote(doc, data.notes, y);
    y = drawTotalsAndPaymentSideBySide(doc, data, y);
  } else {
    y = buildTotalsBlock(doc, data, y);
    y = drawNotes(doc, data.notes, y);
    y = drawPaymentInfo(doc, data, y);
  }

  continuationHeader = (d) => drawContinuationHeader(d, data, SCHEDULE_TITLE);
  drawExpenseSchedule(doc, data);
  continuationHeader = null;
  drawReceiptPages(doc, data);
  drawFooters(doc, data);

  return doc.output("blob");
}

/** AXENTRA_INV_AX26-1001.pdf / AXENTRA_CN_CN26-0001.pdf */
export function invoicePdfFileName(invoiceNumber: string): string {
  const safeNumber = sanitize(invoiceNumber, "INVOICE").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `AXENTRA_${safeNumber.startsWith("CN") ? "CN" : "INV"}_${safeNumber}.pdf`;
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = invoicePdfFileName(data.invoiceNumber);
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
