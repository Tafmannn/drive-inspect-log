import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MARGIN = 20;
const NAVY = [15, 23, 42] as const;       // #0F172A
const NAVY_LIGHT = [30, 41, 59] as const;  // #1E293B
const DARK_TEXT = [15, 23, 42] as const;
const MID_TEXT = [71, 85, 105] as const;   // #475569
const LIGHT_BG = [241, 245, 249] as const; // #F1F5F9
const BORDER = [226, 232, 240] as const;   // #E2E8F0
const WHITE = [255, 255, 255] as const;

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function safeDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result as string);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - MARGIN) {
    doc.addPage();
    return MARGIN + 10;
  }
  return y;
}

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
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;

  // Try loading white logo for dark header
  const logoData = await loadImageAsBase64("/axentra-logo-white.png").catch(() => null)
    ?? await loadImageAsBase64("/axentra-logo-dark.png").catch(() => null)
    ?? await loadImageAsBase64("/axentra-logo.png").catch(() => null);

  // ─── 1. HEADER BANNER ───
  const headerH = 38;
  // Gradient simulation: two rects
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, headerH, "F");
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(pageWidth * 0.6, 0, pageWidth * 0.4, headerH, "F");

  // Logo on left
  if (logoData) {
    try { doc.addImage(logoData, "PNG", MARGIN, 4, 50, 30); } catch { /* skip */ }
  }

  // INVOICE title on right
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("INVOICE", pageWidth - MARGIN, 17, { align: "right" });

  // Invoice number below title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 220);
  doc.text(data.invoiceNumber, pageWidth - MARGIN, 25, { align: "right" });

  // ─── 2. TWO CARDS SIDE BY SIDE ───
  let y = headerH + 12;
  const cardW = (contentWidth - 8) / 2;
  const cardH = 32;
  const leftX = MARGIN;
  const rightX = MARGIN + cardW + 8;

  // Left card background
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(leftX, y, cardW, cardH, 2, 2, "FD");

  // Left card content: Invoice No + Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MID_TEXT);
  doc.text("Invoice No:", leftX + 5, y + 9);
  doc.text("Date:", leftX + 5, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK_TEXT);
  doc.text(data.invoiceNumber, leftX + 30, y + 9);
  doc.text(safeDate(data.issueDate), leftX + 30, y + 20);

  // Right card background
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  const billToLines: string[] = [];
  if (data.clientName) billToLines.push(data.clientName);
  if (data.clientCompany) billToLines.push(data.clientCompany);
  if (data.clientAddress) billToLines.push(data.clientAddress);
  const rightCardH = Math.max(cardH, 14 + billToLines.length * 5.5);
  doc.roundedRect(rightX, y, cardW, rightCardH, 2, 2, "FD");

  // Right card header strip
  doc.setFillColor(...NAVY);
  doc.roundedRect(rightX, y, cardW, 9, 2, 2, "F");
  doc.rect(rightX, y + 4, cardW, 5, "F"); // square off bottom corners of header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text("BILL TO", rightX + 5, y + 6.5);

  // Right card content
  let ry = y + 14;
  doc.setTextColor(...DARK_TEXT);
  doc.setFontSize(9);
  for (let i = 0; i < billToLines.length; i++) {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.text(billToLines[i], rightX + 5, ry);
    ry += 5.5;
  }

  y = y + Math.max(cardH, rightCardH) + 12;

  // ─── 3. LINE ITEMS TABLE ───
  y = ensureSpace(doc, y, 30);
  const vatRate = data.vatRate ?? 20;

  const rows = data.lineItems.map((item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return [
      item.description,
      String(item.quantity),
      "\u00A3" + item.unitPrice.toFixed(2),
      "\u00A3" + lineTotal.toFixed(2),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      textColor: [...DARK_TEXT] as [number, number, number],
    },
    headStyles: {
      fillColor: [...LIGHT_BG] as [number, number, number],
      textColor: [51, 65, 85] as [number, number, number],
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: { bottom: 0.3 },
      lineColor: [...BORDER] as [number, number, number],
    },
    bodyStyles: {
      lineWidth: { bottom: 0.15 },
      lineColor: [240, 240, 240] as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 70 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 26, halign: "right" },
      3: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    head: [["Description", "Qty", "Rate", "Total"]],
    body: rows,
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ─── 4. TOTALS SECTION (right-aligned) ───
  const subtotal = data.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const totalsW = 75;
  const totalsX = pageWidth - MARGIN - totalsW;
  const labelX = totalsX + 5;
  const valueX = pageWidth - MARGIN - 5;

  y = ensureSpace(doc, y, 40);

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MID_TEXT);
  doc.text("Subtotal", labelX, y);
  doc.setTextColor(...DARK_TEXT);
  doc.text("\u00A3" + subtotal.toFixed(2), valueX, y, { align: "right" });
  y += 7;

  // VAT
  doc.setTextColor(...MID_TEXT);
  doc.text("VAT (" + vatRate + "%)", labelX, y);
  doc.setTextColor(...DARK_TEXT);
  doc.text("\u00A3" + vatAmount.toFixed(2), valueX, y, { align: "right" });
  y += 8;

  // Separator line
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y - 3, pageWidth - MARGIN, y - 3);

  // Total row with highlight
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK_TEXT);
  doc.text("Total:", labelX, y + 2);
  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235); // Blue accent for total amount
  doc.text("\u00A3" + total.toFixed(2), valueX, y + 2, { align: "right" });
  y += 18;

  // ─── 5. PAYMENT INFORMATION ───
  y = ensureSpace(doc, y, 55);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);
  doc.text("Payment Information", MARGIN, y);
  y += 6;

  // Separator under title
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 6;

  const paymentRows: [string, string, boolean][] = [
    ["Bank :", "Lloyds Bank", false],
    ["Account Name:", "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics", true],
    ["Sort Code:", "04-00-03", true],
    ["Account Number:", "24861835", true],
  ];

  for (const [label, value, showLine] of paymentRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MID_TEXT);
    doc.text(label, MARGIN, y);

    doc.setFont("helvetica", label === "Account Name:" ? "normal" : "bold");
    doc.setTextColor(...DARK_TEXT);
    const labelW = doc.getTextWidth(label) + 3;
    doc.text(value, MARGIN + labelW, y);
    y += 7;

    if (showLine) {
      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.15);
      doc.line(MARGIN, y - 2.5, pageWidth - MARGIN, y - 2.5);
    }
  }

  y += 3;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Please use invoice number as payment reference.", MARGIN, y);

  // ─── NOTES ───
  if (data.notes) {
    y += 12;
    y = ensureSpace(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK_TEXT);
    doc.text("Notes", MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MID_TEXT);
    const noteLines = doc.splitTextToSize(data.notes, contentWidth);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 4.5;
  }

  // ─── FOOTER ───
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      "Axentra Vehicle Logistics  \u00B7  axentravehicles.com  \u00B7  info@axentravehicles.com",
      pageWidth / 2,
      pageH - 8,
      { align: "center" }
    );
    doc.text("Page " + p + "/" + totalPages, pageWidth - MARGIN, pageH - 8, { align: "right" });
  }

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "AXENTRA_INV_" + data.invoiceNumber + ".pdf";
  a.click();
  URL.revokeObjectURL(url);
}
