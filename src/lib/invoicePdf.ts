import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARGIN = 20;
const FOOTER_GAP = 8;

const THEME = {
  dark: [33, 37, 41] as [number, number, number],
  text: [80, 80, 80] as [number, number, number],
  muted: [130, 130, 130] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightFill: [245, 245, 245] as [number, number, number],
  lightBorder: [200, 200, 200] as [number, number, number],
  accent: [17, 42, 102] as [number, number, number],
};

const AXENTRA_BANK = {
  bankName: "Monzo Bank",
  accountName: "Axentra Vehicle Logistics",
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

function formatCurrency(n: number): string {
  return `£${n.toFixed(2)}`;
}

function safeText(val: string | null | undefined, fallback = "—"): string {
  const text = String(val ?? "").trim();
  return text || fallback;
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function getPageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function getPageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function getContentWidth(doc: jsPDF): number {
  return getPageWidth(doc) - MARGIN * 2;
}

function getFooterY(doc: jsPDF): number {
  return getPageHeight(doc) - FOOTER_GAP;
}

function lastAutoTableY(doc: jsPDF, fallback = MARGIN): number {
  const table = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return table?.finalY ?? fallback;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const usableBottom = getFooterY(doc) - 6;
  if (y + needed > usableBottom) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function setTextStyle(
  doc: jsPDF,
  opts?: {
    size?: number;
    style?: "normal" | "bold" | "italic" | "bolditalic";
    color?: [number, number, number];
  }
): void {
  doc.setFont("helvetica", opts?.style ?? "normal");
  doc.setFontSize(opts?.size ?? 9);
  const c = opts?.color ?? THEME.text;
  doc.setTextColor(c[0], c[1], c[2]);
}

/* ------------------------------------------------------------------ */
/*  Logo                                                               */
/* ------------------------------------------------------------------ */

type CachedImage = { dataUrl: string; format: "PNG" | "JPEG" | "WEBP"; width: number; height: number };

async function loadImageAsDataUrl(url: string): Promise<CachedImage | null> {
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
      : dataUrl.startsWith("data:image/webp") ? "WEBP" as const
      : "JPEG" as const;

    // get dimensions
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = dataUrl;
    });

    return { dataUrl, format, width: img?.width ?? 200, height: img?.height ?? 60 };
  } catch {
    return null;
  }
}

async function renderLogoIfAvailable(
  doc: jsPDF,
  logoUrl: string | undefined
): Promise<CachedImage | null> {
  const url = logoUrl || "/axentra-logo.png";
  return loadImageAsDataUrl(url);
}

function drawImageContain(
  doc: jsPDF,
  image: CachedImage,
  x: number,
  y: number,
  boxW: number,
  boxH: number
): void {
  const scale = Math.min(boxW / image.width, boxH / image.height);
  const rw = image.width * scale;
  const rh = image.height * scale;
  doc.addImage(image.dataUrl, image.format, x + (boxW - rw) / 2, y + (boxH - rh) / 2, rw, rh);
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 14);
  setTextStyle(doc, { size: 11, style: "bold", color: THEME.dark });
  doc.text(title, MARGIN, y);
  const tw = doc.getTextWidth(title);
  doc.setDrawColor(...THEME.dark);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, MARGIN + tw, y + 1);
  return y + 7;
}

function drawHeader(doc: jsPDF, data: InvoiceData, logo: CachedImage | null): number {
  const pw = getPageWidth(doc);
  let y = MARGIN;

  // Logo on the left (if available)
  if (logo) {
    try {
      drawImageContain(doc, logo, MARGIN, y - 4, 40, 18);
    } catch { /* logo fails gracefully */ }
  }

  // Company name
  const companyStartY = logo ? y + 16 : y;
  setTextStyle(doc, { size: 10, style: "bold", color: THEME.dark });
  doc.text("AXENTRA VEHICLE LOGISTICS", MARGIN, companyStartY);
  setTextStyle(doc, { size: 8, style: "normal", color: THEME.muted });
  doc.text("axentravehicles.com", MARGIN, companyStartY + 5);

  // "INVOICE" title – right-aligned
  setTextStyle(doc, { size: 24, style: "bold", color: THEME.accent });
  doc.text("INVOICE", pw - MARGIN, y + 2, { align: "right" });

  return Math.max(companyStartY + 5, y + 10) + 10;
}

function drawKeyValueRows(
  doc: jsPDF,
  rows: Array<[string, string]>,
  y: number
): number {
  const cw = getContentWidth(doc);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      overflow: "linebreak",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40, textColor: THEME.text },
      1: { cellWidth: cw - 40 },
    },
    body: rows,
  });
  return lastAutoTableY(doc) + 4;
}

function drawInvoiceMeta(doc: jsPDF, data: InvoiceData, y: number): number {
  const rows: Array<[string, string]> = [
    ["Invoice No.", safeText(data.invoiceNumber)],
    ["Issue Date", safeDate(data.issueDate)],
  ];
  if (data.dueDate) rows.push(["Due Date", safeDate(data.dueDate)]);
  if (data.paymentTerms) rows.push(["Terms", safeText(data.paymentTerms)]);
  if (data.jobRef) rows.push(["Job Ref", safeText(data.jobRef)]);

  return drawKeyValueRows(doc, rows, y);
}

function drawBillTo(doc: jsPDF, data: InvoiceData, y: number): number {
  y = drawSectionTitle(doc, "Bill To", y);

  const lines: string[] = [];
  if (data.clientName?.trim()) lines.push(data.clientName.trim());
  if (data.clientCompany?.trim()) lines.push(data.clientCompany.trim());
  if (data.clientAddress?.trim()) {
    const parts = data.clientAddress.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    lines.push(...parts);
  }
  if (data.clientEmail?.trim()) lines.push(data.clientEmail.trim());

  lines.forEach((line, i) => {
    const isBold = i === 0;
    setTextStyle(doc, { size: 9, style: isBold ? "bold" : "normal", color: THEME.text });
    doc.text(line, MARGIN, y);
    y += 4.5;
  });

  return y + 4;
}

function drawJobDetails(doc: jsPDF, data: InvoiceData, y: number): number {
  const hasDetails = data.vehicleReg || data.route;
  if (!hasDetails) return y;

  y = drawSectionTitle(doc, "Job Details", y);
  const rows: Array<[string, string]> = [];
  if (data.vehicleReg) rows.push(["Registration", safeText(data.vehicleReg)]);
  if (data.route) rows.push(["Route", safeText(data.route).replace(/→/g, "->")]);

  return drawKeyValueRows(doc, rows, y);
}

function buildChargesTable(doc: jsPDF, items: InvoiceLineItem[], y: number): number {
  y = drawSectionTitle(doc, "Charges", y);
  const cw = getContentWidth(doc);
  const descW = cw - 24 - 28 - 28;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "striped",
    styles: {
      fontSize: 9,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: THEME.dark,
      textColor: THEME.white,
    },
    columnStyles: {
      0: { cellWidth: descW },
      1: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
    },
    head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: items.map(item => {
      const qty = Number(item.quantity ?? 1);
      const price = Number(item.unitPrice ?? 0);
      const amount = qty * price;
      return [
        safeText(item.description, "Line item"),
        String(qty),
        formatCurrency(price),
        formatCurrency(amount),
      ];
    }),
  });

  return lastAutoTableY(doc) + 6;
}

function buildTotalsBlock(
  doc: jsPDF,
  data: InvoiceData,
  y: number
): number {
  const pw = getPageWidth(doc);
  const rightX = pw - MARGIN;
  const labelX = rightX - 60;

  const subtotal = data.lineItems.reduce(
    (sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
    0
  );
  const vatRate = typeof data.vatRate === "number" ? data.vatRate : 0;
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  y = ensureSpace(doc, y, 30);

  // Separator line
  doc.setDrawColor(...THEME.lightBorder);
  doc.setLineWidth(0.3);
  doc.line(labelX - 5, y, rightX, y);
  y += 5;

  // Subtotal
  setTextStyle(doc, { size: 9, style: "normal", color: THEME.text });
  doc.text("Subtotal", labelX, y);
  doc.text(formatCurrency(subtotal), rightX, y, { align: "right" });
  y += 5;

  // VAT
  doc.text(`VAT (${vatRate}%)`, labelX, y);
  doc.text(formatCurrency(vatAmount), rightX, y, { align: "right" });
  y += 6;

  // Total Due
  doc.setDrawColor(...THEME.dark);
  doc.setLineWidth(0.5);
  doc.line(labelX - 5, y - 1, rightX, y - 1);
  y += 3;

  setTextStyle(doc, { size: 13, style: "bold", color: THEME.accent });
  doc.text("TOTAL DUE", labelX, y);
  doc.text(formatCurrency(total), rightX, y, { align: "right" });

  return y + 10;
}

function drawNotes(doc: jsPDF, notes: string | undefined, y: number): number {
  if (!notes?.trim()) return y;
  y = drawSectionTitle(doc, "Notes", y);
  setTextStyle(doc, { size: 9, style: "normal", color: THEME.text });
  const lines = doc.splitTextToSize(notes.trim(), getContentWidth(doc));
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.2 + 6;
}

function drawPaymentInfo(doc: jsPDF, data: InvoiceData, y: number): number {
  y = drawSectionTitle(doc, "Payment Information", y);

  const rows: Array<[string, string]> = [
    ["Bank", AXENTRA_BANK.bankName],
    ["Account Name", AXENTRA_BANK.accountName],
    ["Sort Code", AXENTRA_BANK.sortCode],
    ["Account No.", AXENTRA_BANK.accountNumber],
  ];

  y = drawKeyValueRows(doc, rows, y);

  // Payment reference note
  const refNote = data.paymentTerms?.trim()
    ? `${data.paymentTerms}. Please use invoice number as payment reference.`
    : "Please use invoice number as payment reference.";

  setTextStyle(doc, { size: 8, style: "italic", color: THEME.muted });
  const lines = doc.splitTextToSize(refNote, getContentWidth(doc));
  y = ensureSpace(doc, y, lines.length * 3.5 + 4);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 3.5 + 6;
}

function buildFooter(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages();
  const pw = getPageWidth(doc);
  const footerY = getFooterY(doc);

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Divider
    doc.setDrawColor(...THEME.lightBorder);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, footerY - 4, pw - MARGIN, footerY - 4);

    setTextStyle(doc, { size: 7, style: "normal", color: THEME.muted });
    doc.text(
      "Axentra Vehicle Logistics  •  axentravehicles.com  •  info@axentravehicles.com",
      pw / 2,
      footerY,
      { align: "center" }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logo = await renderLogoIfAvailable(doc, data.logoUrl);

  let y = drawHeader(doc, data, logo);
  y = drawInvoiceMeta(doc, data, y);
  y = drawBillTo(doc, data, y);
  y = drawJobDetails(doc, data, y);
  y = buildChargesTable(doc, data.lineItems, y);
  y = buildTotalsBlock(doc, data, y);
  y = drawNotes(doc, data.notes, y);
  y = drawPaymentInfo(doc, data, y);
  buildFooter(doc);

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `AXENTRA_INV_${safeText(data.invoiceNumber, "INVOICE")}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
