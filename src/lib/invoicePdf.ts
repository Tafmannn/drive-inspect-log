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
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(function (res) {
      var reader = new FileReader();
      reader.onloadend = function () { res(reader.result as string); };
      reader.onerror = function () { res(null); };
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
  var doc = new jsPDF({ unit: "mm", format: "a4" });
  var pageWidth = doc.internal.pageSize.getWidth();
  var contentWidth = pageWidth - MARGIN * 2;

  // Try loading white logo for dark header
  var logoData = await loadImageAsBase64("/axentra-logo-white.png").catch(function () { return null; })
    || await loadImageAsBase64("/axentra-logo-dark.png").catch(function () { return null; })
    || await loadImageAsBase64("/axentra-logo.png").catch(function () { return null; });

  // ─── 1. HEADER BANNER ───
  var headerH = 45;
  // Full navy background
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, headerH, "F");
  // Subtle gradient on right half
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(pageWidth * 0.55, 0, pageWidth * 0.45, headerH, "F");

  // Logo on left — vertically centered
  if (logoData) {
    try { doc.addImage(logoData, "PNG", MARGIN, 7, 55, 31); } catch { /* skip */ }
  }

  // "INVOICE" title on right
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("INVOICE", pageWidth - MARGIN, 20, { align: "right" });

  // Invoice number below title — lighter colour
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(180, 200, 220);
  doc.text(data.invoiceNumber, pageWidth - MARGIN, 30, { align: "right" });

  // ─── 2. TWO CARDS SIDE BY SIDE ───
  var y = headerH + 14;
  var gap = 10;
  var cardW = (contentWidth - gap) / 2;
  var cardH = 34;
  var leftX = MARGIN;
  var rightX = MARGIN + cardW + gap;

  // Left card — light grey rounded rect with border
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, cardW, cardH, 2, 2, "FD");

  // Left card labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MID_TEXT);
  doc.text("Invoice No:", leftX + 6, y + 12);
  doc.text("Date:", leftX + 6, y + 24);

  // Left card values
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);
  doc.text(data.invoiceNumber, leftX + 32, y + 12);
  doc.text(safeDate(data.issueDate), leftX + 32, y + 24);

  // Right card — build bill-to lines
  var billToLines: string[] = [];
  if (data.clientName) billToLines.push(data.clientName);
  if (data.clientCompany) billToLines.push(data.clientCompany);
  if (data.clientAddress) billToLines.push(data.clientAddress);
  var rightCardH = Math.max(cardH, 16 + billToLines.length * 6);

  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightX, y, cardW, rightCardH, 2, 2, "FD");

  // Right card header strip — navy
  doc.setFillColor(...NAVY);
  doc.roundedRect(rightX, y, cardW, 10, 2, 2, "F");
  doc.rect(rightX, y + 5, cardW, 5, "F"); // square off bottom corners
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text("BILL TO", rightX + 6, y + 7);

  // Right card content
  var ry = y + 16;
  doc.setTextColor(...DARK_TEXT);
  doc.setFontSize(10);
  for (var i = 0; i < billToLines.length; i++) {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.text(billToLines[i], rightX + 6, ry);
    ry += 6;
  }

  y = y + Math.max(cardH, rightCardH) + 14;

  // ─── 3. LINE ITEMS TABLE ───
  y = ensureSpace(doc, y, 30);
  var vatRate = data.vatRate != null ? data.vatRate : 20;

  var rows = data.lineItems.map(function (item) {
    var lineTotal = item.quantity * item.unitPrice;
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
      cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 },
      textColor: [...DARK_TEXT] as [number, number, number],
    },
    headStyles: {
      fillColor: [...LIGHT_BG] as [number, number, number],
      textColor: [51, 65, 85] as [number, number, number],
      fontStyle: "bold",
      fontSize: 9,
      lineWidth: { bottom: 0.3 },
      lineColor: [...BORDER] as [number, number, number],
    },
    bodyStyles: {
      lineWidth: { bottom: 0.15 },
      lineColor: [240, 240, 240] as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 75 },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 27, halign: "right", fontStyle: "bold" },
    },
    head: [["Description", "Qty", "Rate", "Total"]],
    body: rows,
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  // ─── 4. TOTALS SECTION (right-aligned) ───
  var subtotal = data.lineItems.reduce(function (s, item) { return s + item.quantity * item.unitPrice; }, 0);
  var vatAmount = subtotal * (vatRate / 100);
  var total = subtotal + vatAmount;

  var totalsW = 80;
  var totalsX = pageWidth - MARGIN - totalsW;
  var labelX = totalsX + 5;
  var valueX = pageWidth - MARGIN - 5;

  y = ensureSpace(doc, y, 45);

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MID_TEXT);
  doc.text("Subtotal", labelX, y);
  doc.setTextColor(...DARK_TEXT);
  doc.text("\u00A3" + subtotal.toFixed(2), valueX, y, { align: "right" });
  y += 8;

  // VAT
  doc.setTextColor(...MID_TEXT);
  doc.text("VAT (" + vatRate + "%)", labelX, y);
  doc.setTextColor(...DARK_TEXT);
  doc.text("\u00A3" + vatAmount.toFixed(2), valueX, y, { align: "right" });
  y += 9;

  // Separator line above total
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y - 3, pageWidth - MARGIN, y - 3);

  // Total row — bold + blue accent
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK_TEXT);
  doc.text("Total:", labelX, y + 3);
  doc.setFontSize(13);
  doc.setTextColor(37, 99, 235); // #2563EB
  doc.text("\u00A3" + total.toFixed(2), valueX, y + 3, { align: "right" });
  y += 22;

  // ─── 5. PAYMENT INFORMATION ───
  y = ensureSpace(doc, y, 60);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);
  doc.text("Payment Information", MARGIN, y);
  y += 6;

  // Separator under title
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 7;

  var paymentRows: [string, string, string][] = [
    ["Bank : ", "Lloyds Bank", "bold"],
    ["Account Name: ", "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics", "bold"],
    ["Sort Code:  ", "04-00-03", "bold"],
    ["Account Number:  ", "24861835", "bold"],
  ];

  for (var pi = 0; pi < paymentRows.length; pi++) {
    var pLabel = paymentRows[pi][0];
    var pValue = paymentRows[pi][1];
    var pStyle = paymentRows[pi][2];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MID_TEXT);
    doc.text(pLabel, MARGIN, y);

    doc.setFont("helvetica", pStyle as "bold" | "normal");
    doc.setTextColor(...DARK_TEXT);
    var lw = doc.getTextWidth(pLabel) + 2;
    doc.text(pValue, MARGIN + lw, y);
    y += 7.5;

    // Divider line after each row
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y - 2.5, pageWidth - MARGIN, y - 2.5);
  }

  y += 4;
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
    var noteLines = doc.splitTextToSize(data.notes, contentWidth);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 4.5;
  }

  // ─── FOOTER ───
  var totalPages = doc.getNumberOfPages();
  for (var p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    var pageH = doc.internal.pageSize.getHeight();
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
  var blob = await generateInvoicePdf(data);
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "AXENTRA_INV_" + data.invoiceNumber + ".pdf";
  a.click();
  URL.revokeObjectURL(url);
}
