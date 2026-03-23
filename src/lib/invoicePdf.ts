import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARGIN = 16;

const THEME = {
  navy: [17, 29, 58] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  text: [50, 50, 50] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  lightBorder: [200, 200, 200] as [number, number, number],
  tableStripe: [248, 248, 250] as [number, number, number],
};

const AXENTRA_BANK = {
  bankName: "Monzo",
  accountName: "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics",
  sortCode: "04-00-03",
  accountNumber: "24861835",
} as const;

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

function safe(val: string | null | undefined, fb = "—"): string {
  const t = String(val ?? "").trim();
  return t || fb;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function pw(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function lastY(doc: jsPDF, fb = MARGIN): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fb;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const bottom = doc.internal.pageSize.getHeight() - 10;
  if (y + needed > bottom) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/* ------------------------------------------------------------------ */
/*  Logo loader                                                        */
/* ------------------------------------------------------------------ */

type CachedImage = { dataUrl: string; format: "PNG" | "JPEG" | "WEBP"; w: number; h: number };

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
    const format = dataUrl.startsWith("data:image/png") ? "PNG" as const
      : dataUrl.startsWith("data:image/webp") ? "WEBP" as const : "JPEG" as const;
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = dataUrl;
    });
    return { dataUrl, format, w: img?.width ?? 200, h: img?.height ?? 60 };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  1. Header Banner                                                   */
/* ------------------------------------------------------------------ */

function drawHeaderBanner(
  doc: jsPDF,
  data: InvoiceData,
  logo: CachedImage | null
): number {
  const pageW = pw(doc);
  const bannerH = 52;

  // Navy background
  doc.setFillColor(...THEME.navy);
  doc.rect(0, 0, pageW, bannerH, "F");

  // Logo on left — fit within box
  if (logo) {
    try {
      const maxW = 44;
      const maxH = 30;
      const scale = Math.min(maxW / logo.w, maxH / logo.h);
      const rw = logo.w * scale;
      const rh = logo.h * scale;
      const logoY = (bannerH - rh) / 2; // vertically center
      doc.addImage(logo.dataUrl, logo.format, MARGIN, logoY, rw, rh);
    } catch { /* graceful */ }
  }

  // Company name + tagline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...THEME.white);
  doc.text("AXENTRA VEHICLES", MARGIN, 38);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text("Precision in Every Move", MARGIN, 44);

  // "INVOICE" title — right aligned
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("INVOICE", pageW - MARGIN, 24, { align: "right" });

  // Invoice number below
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(safe(data.invoiceNumber), pageW - MARGIN, 34, { align: "right" });

  return bannerH + 8;
}

/* ------------------------------------------------------------------ */
/*  2. Meta + Bill To (two side-by-side boxes)                         */
/* ------------------------------------------------------------------ */

function drawMetaAndBillTo(doc: jsPDF, data: InvoiceData, y: number): number {
  const pageW = pw(doc);
  const contentW = pageW - MARGIN * 2;
  const boxW = (contentW - 6) / 2; // 6mm gap
  const leftX = MARGIN;
  const rightX = MARGIN + boxW + 6;
  const boxH = 36;

  // --- Left box: Invoice details ---
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.4);
  doc.rect(leftX, y, boxW, boxH);

  let ly = y + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.text);
  doc.text("Invoice No:", leftX + 4, ly);
  doc.setFont("helvetica", "normal");
  doc.text(safe(data.invoiceNumber), leftX + 30, ly);

  ly += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Date:", leftX + 4, ly);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(data.issueDate), leftX + 30, ly);

  if (data.dueDate) {
    ly += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Due Date:", leftX + 4, ly);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(data.dueDate), leftX + 30, ly);
  }

  if (data.jobRef) {
    ly += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Job Ref:", leftX + 4, ly);
    doc.setFont("helvetica", "normal");
    doc.text(safe(data.jobRef), leftX + 30, ly);
  }

  // --- Right box: Bill To ---
  doc.setDrawColor(...THEME.lightBorder);
  doc.rect(rightX, y, boxW, boxH);

  // Dark header strip
  const stripH = 8;
  doc.setFillColor(...THEME.navy);
  doc.rect(rightX, y, boxW, stripH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.white);
  doc.text("BILL TO", rightX + 4, y + 5.5);

  // Client details
  let ry = y + stripH + 6;
  const lines: string[] = [];
  if (data.clientName?.trim()) lines.push(data.clientName.trim());
  if (data.clientCompany?.trim()) lines.push(data.clientCompany.trim());
  if (data.clientAddress?.trim()) {
    const parts = data.clientAddress.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    lines.push(...parts);
  }
  if (data.clientEmail?.trim()) lines.push(data.clientEmail.trim());

  lines.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...THEME.text);
    doc.text(line, rightX + 4, ry, { maxWidth: boxW - 8 });
    ry += 4.5;
  });

  return y + boxH + 8;
}

/* ------------------------------------------------------------------ */
/*  3. Charges Table                                                   */
/* ------------------------------------------------------------------ */

function buildChargesTable(doc: jsPDF, items: InvoiceLineItem[], y: number): number {
  const contentW = pw(doc) - MARGIN * 2;
  const descW = contentW - 22 - 28 - 30;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "striped",
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: THEME.lightBorder,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: THEME.navy,
      textColor: THEME.white,
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: THEME.tableStripe,
    },
    columnStyles: {
      0: { cellWidth: descW },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
    },
    head: [["Description", "Qty", "Rate", "Total"]],
    body: items.map(item => {
      const qty = Number(item.quantity ?? 1);
      const price = Number(item.unitPrice ?? 0);
      return [
        safe(item.description, "Line item"),
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
  const pageW = pw(doc);
  const rightX = pageW - MARGIN;
  const labelX = rightX - 70;
  const valX = rightX;

  const subtotal = data.lineItems.reduce(
    (s, item) => s + Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0), 0
  );
  const vatRate = typeof data.vatRate === "number" ? data.vatRate : 0;
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  y = ensureSpace(doc, y, 30);

  // Subtotal row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.text);
  doc.text("Subtotal", labelX, y);
  doc.text(fmt(subtotal), valX, y, { align: "right" });
  y += 6;

  // VAT row
  doc.text(`VAT (${vatRate}%)`, labelX, y);
  doc.text(fmt(vatAmount), valX, y, { align: "right" });
  y += 8;

  // Total row — dark filled background
  const totalRowH = 10;
  const totalRowW = 72;
  const totalRowX = rightX - totalRowW;
  doc.setFillColor(...THEME.navy);
  doc.rect(totalRowX, y - 5, totalRowW, totalRowH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...THEME.white);
  doc.text("Total:", totalRowX + 4, y + 1.5);
  doc.text(fmt(total), valX - 3, y + 1.5, { align: "right" });

  return y + totalRowH + 8;
}

/* ------------------------------------------------------------------ */
/*  5. Notes (conditional)                                             */
/* ------------------------------------------------------------------ */

function drawNotes(doc: jsPDF, notes: string | undefined, y: number): number {
  if (!notes?.trim()) return y;
  y = ensureSpace(doc, y, 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.navy);
  doc.text("Notes", MARGIN, y);
  const tw = doc.getTextWidth("Notes");
  doc.setDrawColor(...THEME.navy);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, MARGIN + tw, y + 1);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...THEME.text);
  const contentW = pw(doc) - MARGIN * 2;
  const lines = doc.splitTextToSize(notes.trim(), contentW);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.2 + 6;
}

/* ------------------------------------------------------------------ */
/*  6. Payment Information                                             */
/* ------------------------------------------------------------------ */

function drawPaymentInfo(doc: jsPDF, data: InvoiceData, y: number): number {
  y = ensureSpace(doc, y, 40);

  // Title with underline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...THEME.navy);
  doc.text("Payment Information", MARGIN, y);
  const tw = doc.getTextWidth("Payment Information");
  doc.setDrawColor(...THEME.navy);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, MARGIN + tw, y + 1);
  y += 8;

  // Bank details as simple label: value lines
  const details: Array<[string, string]> = [
    ["Bank", AXENTRA_BANK.bankName],
    ["Account Name", AXENTRA_BANK.accountName],
    ["Sort Code", AXENTRA_BANK.sortCode],
    ["Account Number", AXENTRA_BANK.accountNumber],
  ];

  doc.setFontSize(9);
  doc.setTextColor(...THEME.text);

  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    const labelText = `${label}: `;
    doc.text(labelText, MARGIN, y);
    const labelW = doc.getTextWidth(labelText);
    doc.setFont("helvetica", "normal");
    doc.text(value, MARGIN + labelW, y);
    y += 5;
  }

  y += 3;

  // Reference note
  const refNote = data.paymentTerms?.trim()
    ? `${data.paymentTerms}. Please use invoice number as payment reference.`
    : "Please use invoice number as payment reference.";

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...THEME.muted);
  const contentW = pw(doc) - MARGIN * 2;
  const lines = doc.splitTextToSize(refNote, contentW);
  doc.text(lines, MARGIN, y);

  return y + lines.length * 3.5 + 6;
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logo = await loadImg(data.logoUrl || "/axentra-logo-white.png");

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
    a.download = `AXENTRA_INV_${safe(data.invoiceNumber, "INVOICE")}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
