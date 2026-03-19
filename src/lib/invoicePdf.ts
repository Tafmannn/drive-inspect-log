import jsPDF from "jspdf";

const PAGE_BG = [243, 243, 243] as const;
const WHITE = [255, 255, 255] as const;
const NAVY = [8, 31, 79] as const;
const NAVY_RIGHT = [11, 36, 87] as const;
const DARK = [24, 33, 53] as const;
const MID = [78, 89, 110] as const;
const LINE = [221, 226, 232] as const;
const SOFT = [245, 247, 250] as const;
const TOTAL_BLUE = [17, 42, 102] as const;

const PAGE_MARGIN = 6;
const INNER_X = 16;
const FOOTER_Y_OFFSET = 8;

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

function money(value: number): string {
  return `£${value.toFixed(2)}`;
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function clean(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text || "—";
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function setText(
  doc: jsPDF,
  size: number,
  style: "normal" | "bold" = "normal",
  color: readonly [number, number, number] = DARK
) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function fitSingleLine(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
  style: "normal" | "bold" = "normal"
): string {
  setText(doc, fontSize, style, DARK);
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let t = text;
  while (t.length > 0 && doc.getTextWidth(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t ? `${t}…` : "";
}

function splitAddressLines(address?: string): string[] {
  if (!address?.trim()) return [];
  const parts = address
    .split(/\n|,/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [address];
}

function drawPageShell(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFillColor(PAGE_BG[0], PAGE_BG[1], PAGE_BG[2]);
  doc.rect(0, 0, pageW, pageH, "F");

  const sheetX = PAGE_MARGIN;
  const sheetY = PAGE_MARGIN;
  const sheetW = pageW - PAGE_MARGIN * 2;
  const sheetH = pageH - PAGE_MARGIN * 2 - 5;

  doc.setFillColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setDrawColor(227, 231, 236);
  doc.setLineWidth(0.2);
  doc.roundedRect(sheetX, sheetY, sheetW, sheetH, 1, 1, "FD");

  return { pageW, pageH, sheetX, sheetY, sheetW, sheetH };
}

function drawHeader(doc: jsPDF, pageW: number, invoiceNumber: string, logo: string | null) {
  const x = PAGE_MARGIN;
  const y = PAGE_MARGIN;
  const w = pageW - PAGE_MARGIN * 2;
  const h = 40;

  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(x, y, w, h, "F");

  doc.setFillColor(NAVY_RIGHT[0], NAVY_RIGHT[1], NAVY_RIGHT[2]);
  doc.rect(x + w * 0.56, y, w * 0.44, h, "F");

  if (logo) {
    try {
      doc.addImage(logo, "PNG", 14, 11.5, 54, 27.5);
    } catch {
      // ignore
    }
  }

  setText(doc, 24, "bold", WHITE);
  doc.text("INVOICE", pageW - 18, 21, { align: "right" });

  setText(doc, 10.8, "bold", WHITE);
  doc.text(invoiceNumber, pageW - 18, 29.6, { align: "right" });

  return 58;
}

function drawCards(doc: jsPDF, pageW: number, data: InvoiceData) {
  const gap = 4;
  const cardX = INNER_X;
  const totalInnerW = pageW - INNER_X * 2;
  const cardW = (totalInnerW - gap) / 2;
  const leftX = cardX;
  const rightX = leftX + cardW + gap;
  const topY = 58;
  const cardH = 27;

  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(leftX, topY, cardW, cardH, 1.2, 1.2, "FD");
  doc.roundedRect(rightX, topY, cardW, cardH, 1.2, 1.2, "FD");

  // left card
  setText(doc, 8.6, "normal", MID);
  doc.text("Invoice No:", leftX + 4, topY + 9.5);
  doc.text("Date:", leftX + 4, topY + 19.2);

  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.18);
  doc.line(leftX + 4, topY + 12.6, leftX + cardW - 4, topY + 12.6);

  setText(doc, 9.6, "normal", DARK);
  doc.text(
    fitSingleLine(doc, clean(data.invoiceNumber), 46, 9.6, "normal"),
    leftX + 36,
    topY + 9.5
  );
  doc.text(
    fitSingleLine(doc, safeDate(data.issueDate), 46, 9.6, "normal"),
    leftX + 36,
    topY + 19.2
  );

  // right card
  setText(doc, 8.7, "bold", DARK);
  doc.text("BILL TO", rightX + 4, topY + 9);

  doc.line(rightX + 4, topY + 12.6, rightX + cardW - 4, topY + 12.6);

  const lines: string[] = [];
  if (data.clientName) lines.push(data.clientName);
  if (data.clientCompany) lines.push(data.clientCompany);
  lines.push(...splitAddressLines(data.clientAddress));

  let y = topY + 17.5;
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    setText(doc, 9.5, i === 0 ? "bold" : "normal", DARK);
    doc.text(
      fitSingleLine(doc, lines[i], cardW - 8, 9.5, i === 0 ? "bold" : "normal"),
      rightX + 4,
      y
    );
    y += 5.7;
  }

  return topY + cardH + 8;
}

function drawTable(doc: jsPDF, pageW: number, startY: number, data: InvoiceData) {
  const x = INNER_X;
  const w = pageW - INNER_X * 2;

  const descW = 107;
  const qtyW = 16;
  const rateW = 22;
  const totalW = w - descW - qtyW - rateW;

  const xDesc = x;
  const xQty = xDesc + descW;
  const xRate = xQty + qtyW;
  const xTotal = xRate + rateW;

  const headH = 9;
  const rowH = 10.6;

  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.rect(x, startY, w, headH, "FD");

  setText(doc, 8.7, "bold", DARK);
  doc.text("Description", xDesc + 4, startY + 5.8);
  doc.text("Qty", xQty + qtyW / 2, startY + 5.8, { align: "center" });
  doc.text("Rate", xRate + rateW / 2, startY + 5.8, { align: "center" });
  doc.text("Total", xTotal + totalW / 2, startY + 5.8, { align: "center" });

  const item = data.lineItems[0];
  const subtotal = data.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  const desc = item
    ? item.description
    : [data.vehicleReg, data.route].filter(Boolean).join(" — ") || "Vehicle transportation";

  setText(doc, 8.9, "normal", DARK);
  doc.text(fitSingleLine(doc, desc, descW - 8, 8.9, "normal"), xDesc + 4, startY + headH + 6.2);

  setText(doc, 8.9, "bold", DARK);
  doc.text(String(item?.quantity ?? 1), xQty + qtyW / 2, startY + headH + 6.2, { align: "center" });
  doc.text(money(item?.unitPrice ?? subtotal), xRate + rateW - 4, startY + headH + 6.2, { align: "right" });
  doc.text(money(item ? item.quantity * item.unitPrice : subtotal), xTotal + totalW - 4, startY + headH + 6.2, {
    align: "right",
  });

  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.line(x, startY + headH + rowH, x + w, startY + headH + rowH);

  return startY + headH + rowH + 14;
}

function drawTotals(doc: jsPDF, pageW: number, y: number, data: InvoiceData) {
  const vatRate = data.vatRate ?? 0;
  const subtotal = data.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const vat = subtotal * (vatRate / 100);
  const total = subtotal + vat;

  const boxW = 58;
  const boxX = pageW - INNER_X - boxW;
  const rightX = pageW - INNER_X - 5;
  const labelX = boxX + 7;

  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.line(INNER_X, y, pageW - INNER_X, y);

  y += 8.5;

  setText(doc, 9, "normal", MID);
  doc.text("Subtotal", labelX, y);
  setText(doc, 9, "bold", DARK);
  doc.text(money(subtotal), rightX, y, { align: "right" });

  y += 8;
  setText(doc, 9, "normal", MID);
  doc.text(`VAT (${vatRate}%)`, labelX, y);
  setText(doc, 9, "bold", DARK);
  doc.text(money(vat), rightX, y, { align: "right" });

  y += 6;
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.line(boxX, y, pageW - INNER_X, y);

  y += 3.5;

  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.setDrawColor(182, 190, 201);
  doc.rect(boxX, y, boxW, 11, "FD");

  setText(doc, 10.2, "bold", DARK);
  doc.text("Total:", labelX, y + 7);

  setText(doc, 13, "bold", TOTAL_BLUE);
  doc.text(money(total), rightX, y + 7, { align: "right" });

  return y + 17;
}

function drawPayment(doc: jsPDF, pageW: number, y: number) {
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.line(INNER_X, y, pageW - INNER_X, y);

  y += 7.5;
  setText(doc, 10, "bold", DARK);
  doc.text("Payment Information", INNER_X + 2, y);

  y += 4.5;
  doc.line(INNER_X + 2, y, pageW - INNER_X, y);

  const rows: Array<[string, string, "normal" | "bold"]> = [
    ["Bank :", "Lloyds Bank", "normal"],
    ["Account Name:", "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics", "bold"],
    ["Sort Code:", "04-00-03", "bold"],
    ["Account Number:", "24861835", "normal"],
  ];

  y += 6.5;

  for (const [label, value, style] of rows) {
    setText(doc, 9, "normal", DARK);
    doc.text(label, INNER_X + 2, y);

    const labelW = doc.getTextWidth(label) + 2;
    setText(doc, 9, style, DARK);
    doc.text(
      fitSingleLine(doc, value, pageW - INNER_X - (INNER_X + 2 + labelW), 9, style),
      INNER_X + 2 + labelW,
      y
    );

    y += 7;
    doc.setDrawColor(232, 236, 241);
    doc.setLineWidth(0.15);
    doc.line(INNER_X + 2, y - 2.2, pageW - INNER_X, y - 2.2);
  }

  y += 3;
  setText(doc, 8.2, "normal", MID);
  doc.text("Please use invoice number as payment reference.", INNER_X + 2, y);

  return y + 2;
}

function drawNotes(doc: jsPDF, pageW: number, y: number, notes?: string) {
  if (!notes?.trim()) return y;

  y += 8;
  setText(doc, 9, "bold", DARK);
  doc.text("Notes", INNER_X, y);

  y += 5;
  setText(doc, 8.2, "normal", MID);
  const lines = doc.splitTextToSize(notes, pageW - INNER_X * 2);
  doc.text(lines, INNER_X, y);

  return y + lines.length * 4.2;
}

function drawFooter(doc: jsPDF, pageW: number) {
  const totalPages = doc.getNumberOfPages();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();

    setText(doc, 7, "normal", [155, 163, 175]);
    doc.text(
      "Axentra Vehicle Logistics · axentravehicles.com · info@axentravehicles.com",
      pageW / 2,
      pageH - FOOTER_Y_OFFSET,
      { align: "center" }
    );
    doc.text(`Page ${p}/${totalPages}`, pageW - INNER_X, pageH - FOOTER_Y_OFFSET, {
      align: "right",
    });
  }
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { pageW } = drawPageShell(doc);

  const logoData =
    (await loadImageAsBase64("/axentra-logo-white.png")) ||
    (await loadImageAsBase64("/axentra-logo-dark.png")) ||
    (await loadImageAsBase64("/axentra-logo.png"));

  let y = drawHeader(doc, pageW, clean(data.invoiceNumber), logoData);
  y = drawCards(doc, pageW, data);
  y = drawTable(doc, pageW, y, data);
  y = drawTotals(doc, pageW, y, data);
  y = drawPayment(doc, pageW, y);

  if (data.notes) {
    y = drawNotes(doc, pageW, y, data.notes);
  }

  drawFooter(doc, pageW);
  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `AXENTRA_INV_${data.invoiceNumber}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
