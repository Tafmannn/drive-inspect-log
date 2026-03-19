import jsPDF from "jspdf";

const TEMPLATE_PATH = "/invoice-template.png";

// A4 portrait in mm
const PAGE_W = 210;
const PAGE_H = 297;

// Theme
const DARK: [number, number, number] = [24, 33, 53];
const MID: [number, number, number] = [78, 89, 110];
const BLUE: [number, number, number] = [17, 42, 102];
const WHITE: [number, number, number] = [255, 255, 255];

// Bank details locked to your preferred values
const AXENTRA_BANK = {
  bankName: "Monzo Bank",
  accountName: "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics",
  sortCode: "04-00-03",
  accountNumber: "24861835",
  paymentTermsText: "Payable within 7 days. Please use invoice number as payment reference.",
} as const;

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

// Tuned for your locked template.
// These positions assume your approved template image is used as the PDF background.
const POS = {
  invoiceNoTopRight: { x: 186.0, y: 29.8, maxW: 34 },

  leftCard: {
    invoiceNo: { x: 68.5, y: 75.4, maxW: 38 },
    date: { x: 68.5, y: 84.9, maxW: 38 },
  },

  rightCard: {
    line1: { x: 112.4, y: 74.9, maxW: 77 },
    line2: { x: 112.4, y: 80.8, maxW: 77 },
    line3: { x: 112.4, y: 86.7, maxW: 77 },
    line4: { x: 112.4, y: 92.6, maxW: 77 },
  },

  table: {
    startY: 111.0,
    rowGap: 7.3,
    description: { x: 20.2, maxW: 103 },
    qty: { x: 138.8 },
    rate: { x: 164.8 },
    total: { x: 189.6 },
    maxRows: 4,
  },

  totals: {
    subtotal: { x: 189.6, y: 145.2 },
    vat: { x: 189.6, y: 153.2 },
    total: { x: 189.6, y: 164.5 },
  },

  payment: {
    bank: { x: 39.2, y: 183.2, maxW: 80 },
    accountName: { x: 54.4, y: 190.7, maxW: 135 },
    sortCode: { x: 39.2, y: 198.0, maxW: 80 },
    accountNumber: { x: 51.8, y: 205.3, maxW: 80 },
    terms: { x: 17.8, y: 213.0, maxW: 175 },
  },

  notes: {
    title: { x: 16.0, y: 224.0 },
    body: { x: 16.0, y: 229.0, maxW: 178, lineH: 4.2, maxLines: 8 },
  },
} as const;

function clean(value: string | null | undefined, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
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

function addDays(dateIso: string | null | undefined, days: number): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "—";
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function setText(
  doc: jsPDF,
  opts: {
    size: number;
    style?: "normal" | "bold" | "italic" | "bolditalic";
    color?: [number, number, number];
  }
): void {
  doc.setFont("helvetica", opts.style ?? "normal");
  doc.setFontSize(opts.size);
  const color = opts.color ?? DARK;
  doc.setTextColor(color[0], color[1], color[2]);
}

function fitSingleLine(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  opts: {
    size: number;
    style?: "normal" | "bold";
    color?: [number, number, number];
  }
): string {
  setText(doc, opts);
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let out = text;
  while (out.length > 0 && doc.getTextWidth(`${out}…`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out ? `${out}…` : "";
}

function splitAddressLines(address?: string): string[] {
  if (!address?.trim()) return [];
  const parts = address
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

function clipLines(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  maxLines: number,
  opts: {
    size: number;
    style?: "normal" | "bold";
    color?: [number, number, number];
  }
): string[] {
  setText(doc, opts);
  const raw = doc.splitTextToSize(text, maxWidth) as string[];
  if (raw.length <= maxLines) return raw;

  const clipped = raw.slice(0, maxLines);
  clipped[maxLines - 1] = fitSingleLine(doc, clipped[maxLines - 1], maxWidth, opts);
  return clipped;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addTemplateBackground(doc: jsPDF, templateData: string): void {
  doc.addImage(templateData, "PNG", 0, 0, PAGE_W, PAGE_H);
}

function getVisibleItems(data: InvoiceData): InvoiceLineItem[] {
  if (data.lineItems.length > 0) return data.lineItems.slice(0, POS.table.maxRows);

  return [
    {
      description: getFallbackDescription(data),
      quantity: 1,
      unitPrice: 0,
    },
  ];
}

function getFallbackDescription(data: InvoiceData): string {
  const parts = [
    "Vehicle transportation",
    data.vehicleReg ? `– ${data.vehicleReg}` : "",
    data.route ? `– ${data.route}` : "",
    data.jobRef ? `– Job ${data.jobRef}` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

function getSubtotal(data: InvoiceData): number {
  return data.lineItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    return sum + qty * unitPrice;
  }, 0);
}

function getVatRate(data: InvoiceData): number {
  if (typeof data.vatRate === "number") return data.vatRate;
  const itemVat = data.lineItems.find((i) => typeof i.vatRate === "number")?.vatRate;
  return typeof itemVat === "number" ? itemVat : 0;
}

function buildBillToLines(data: InvoiceData): string[] {
  const lines: string[] = [];
  if (data.clientName?.trim()) lines.push(data.clientName.trim());
  if (data.clientCompany?.trim()) lines.push(data.clientCompany.trim());

  const addressLines = splitAddressLines(data.clientAddress);
  lines.push(...addressLines);

  return lines.slice(0, 4);
}

function drawInvoiceMeta(doc: jsPDF, data: InvoiceData): void {
  setText(doc, { size: 10.8, style: "bold", color: WHITE });
  doc.text(
    fitSingleLine(doc, clean(data.invoiceNumber), POS.invoiceNoTopRight.maxW, {
      size: 10.8,
      style: "bold",
      color: WHITE,
    }),
    POS.invoiceNoTopRight.x,
    POS.invoiceNoTopRight.y,
    { align: "right" }
  );

  setText(doc, { size: 9.5, style: "normal", color: DARK });
  doc.text(
    fitSingleLine(doc, clean(data.invoiceNumber), POS.leftCard.invoiceNo.maxW, {
      size: 9.5,
      style: "normal",
    }),
    POS.leftCard.invoiceNo.x,
    POS.leftCard.invoiceNo.y
  );

  doc.text(
    fitSingleLine(doc, safeDate(data.issueDate), POS.leftCard.date.maxW, {
      size: 9.5,
      style: "normal",
    }),
    POS.leftCard.date.x,
    POS.leftCard.date.y
  );
}

function drawBillTo(doc: jsPDF, data: InvoiceData): void {
  const lines = buildBillToLines(data);

  const targets = [
    POS.rightCard.line1,
    POS.rightCard.line2,
    POS.rightCard.line3,
    POS.rightCard.line4,
  ];

  lines.forEach((line, idx) => {
    const target = targets[idx];
    if (!target) return;

    const isFirst = idx === 0;
    doc.setFont("helvetica", isFirst ? "bold" : "normal");
    doc.setFontSize(isFirst ? 9.5 : 9.3);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);

    doc.text(
      fitSingleLine(doc, line, target.maxW, {
        size: isFirst ? 9.5 : 9.3,
        style: isFirst ? "bold" : "normal",
      }),
      target.x,
      target.y
    );
  });
}

function drawLineItems(doc: jsPDF, data: InvoiceData): void {
  const items = getVisibleItems(data);

  items.forEach((item, idx) => {
    const y = POS.table.startY + idx * POS.table.rowGap;
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

    setText(doc, { size: 8.8, style: "normal", color: DARK });
    doc.text(
      fitSingleLine(doc, clean(item.description, getFallbackDescription(data)), POS.table.description.maxW, {
        size: 8.8,
        style: "normal",
      }),
      POS.table.description.x,
      y
    );

    setText(doc, { size: 8.8, style: "bold", color: DARK });
    doc.text(String(Number(item.quantity) || 0), POS.table.qty.x, y, { align: "center" });
    doc.text(money(Number(item.unitPrice) || 0), POS.table.rate.x, y, { align: "right" });
    doc.text(money(lineTotal), POS.table.total.x, y, { align: "right" });
  });
}

function drawTotals(doc: jsPDF, data: InvoiceData): void {
  const subtotal = getSubtotal(data);
  const vatRate = getVatRate(data);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  setText(doc, { size: 9.0, style: "bold", color: DARK });
  doc.text(money(subtotal), POS.totals.subtotal.x, POS.totals.subtotal.y, { align: "right" });
  doc.text(money(vatAmount), POS.totals.vat.x, POS.totals.vat.y, { align: "right" });

  setText(doc, { size: 13.0, style: "bold", color: BLUE });
  doc.text(money(total), POS.totals.total.x, POS.totals.total.y, { align: "right" });
}

function drawPaymentDetails(doc: jsPDF, data: InvoiceData): void {
  setText(doc, { size: 9.0, style: "normal", color: DARK });
  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.bankName, POS.payment.bank.maxW, {
      size: 9.0,
      style: "normal",
    }),
    POS.payment.bank.x,
    POS.payment.bank.y
  );

  setText(doc, { size: 9.0, style: "bold", color: DARK });
  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.accountName, POS.payment.accountName.maxW, {
      size: 9.0,
      style: "bold",
    }),
    POS.payment.accountName.x,
    POS.payment.accountName.y
  );

  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.sortCode, POS.payment.sortCode.maxW, {
      size: 9.0,
      style: "bold",
    }),
    POS.payment.sortCode.x,
    POS.payment.sortCode.y
  );

  setText(doc, { size: 9.0, style: "normal", color: DARK });
  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.accountNumber, POS.payment.accountNumber.maxW, {
      size: 9.0,
      style: "normal",
    }),
    POS.payment.accountNumber.x,
    POS.payment.accountNumber.y
  );

  const termsText =
    data.paymentTerms?.trim()
      ? `${data.paymentTerms.trim()} Please use invoice number as payment reference.`
      : AXENTRA_BANK.paymentTermsText;

  const termsLines = clipLines(doc, termsText, POS.payment.terms.maxW, 2, {
    size: 8.6,
    style: "normal",
    color: DARK,
  });

  if (termsLines.length > 0) {
    setText(doc, { size: 8.6, style: "bold", color: DARK });
    const firstLine = termsLines[0];
    const prefix = "Payable within 7 days.";
    if (firstLine.startsWith(prefix)) {
      doc.text(prefix, POS.payment.terms.x, POS.payment.terms.y);
      setText(doc, { size: 8.6, style: "normal", color: DARK });
      const rest = firstLine.slice(prefix.length).trim();
      if (rest) {
        doc.text(rest, POS.payment.terms.x + 40.5, POS.payment.terms.y);
      }
    } else {
      setText(doc, { size: 8.6, style: "normal", color: DARK });
      doc.text(firstLine, POS.payment.terms.x, POS.payment.terms.y);
    }

    if (termsLines[1]) {
      setText(doc, { size: 8.6, style: "normal", color: DARK });
      doc.text(termsLines[1], POS.payment.terms.x, POS.payment.terms.y + 4.2);
    }
  }
}

function drawNotes(doc: jsPDF, notes?: string): void {
  if (!notes?.trim()) return;

  setText(doc, { size: 9.0, style: "bold", color: DARK });
  doc.text("Notes", POS.notes.title.x, POS.notes.title.y);

  const lines = clipLines(doc, notes.trim(), POS.notes.body.maxW, POS.notes.body.maxLines, {
    size: 8.2,
    style: "normal",
    color: MID,
  });

  setText(doc, { size: 8.2, style: "normal", color: MID });
  doc.text(lines, POS.notes.body.x, POS.notes.body.y, {
    lineHeightFactor: 1.0,
  });
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const templateData = await loadImageAsBase64(TEMPLATE_PATH);
  if (!templateData) {
    throw new Error(
      `Missing invoice template. Add the approved file to ${TEMPLATE_PATH}`
    );
  }

  addTemplateBackground(doc, templateData);
  drawInvoiceMeta(doc, data);
  drawBillTo(doc, data);
  drawLineItems(doc, data);
  drawTotals(doc, data);
  drawPaymentDetails(doc, data);
  drawNotes(doc, data.notes);

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `AXENTRA_INV_${clean(data.invoiceNumber, "INVOICE")}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
