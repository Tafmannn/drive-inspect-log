import jsPDF from "jspdf";

const TEMPLATE_PATH = "/invoice-template.png";

// A4 size in mm
const PAGE_W = 210;
const PAGE_H = 297;

// Locked colors
const DARK: [number, number, number] = [24, 33, 53];
const MID: [number, number, number] = [78, 89, 110];
const BLUE: [number, number, number] = [17, 42, 102];
const WHITE: [number, number, number] = [255, 255, 255];

// Locked bank details
const AXENTRA_BANK = {
  bankName: "Monzo Bank",
  accountName: "Axentra Vehicle Logistics",
  sortCode: "04-00-03",
  accountNumber: "24861835",
  paymentTermsText: "Payable within 7 days. Please use invoice number as payment reference.",
} as const;

// Locked overlay coordinates tuned for your template
const POS = {
  invoiceNoTopRight: { x: 186.0, y: 55.0, maxW: 34 },

  leftCard: {
    invoiceNo: { x: 48.0, y: 76.5, maxW: 38 },
    date: { x: 34.0, y: 83.5, maxW: 38 },
  },

  rightCard: {
    line1: { x: 112.8, y: 83.0, maxW: 74 },
    line2: { x: 112.8, y: 89.0, maxW: 74 },
    line3: { x: 112.8, y: 95.0, maxW: 74 },
    line4: { x: 112.8, y: 101.0, maxW: 74 },
  },

  table: {
    startY: 121.0,
    rowGap: 8.0,
    description: { x: 25.0, maxW: 101 },
    qty: { x: 139.2 },
    rate: { x: 165.6 },
    total: { x: 189.4 },
    maxRows: 4,
  },

  totals: {
    subtotal: { x: 189.4, y: 160.0 },
    vat: { x: 189.4, y: 167.0 },
    total: { x: 189.4, y: 178.0 },
  },

  payment: {
    bank: { x: 39.2, y: 186.0, maxW: 80 },
    accountName: { x: 54.5, y: 193.5, maxW: 160 },
    sortCode: { x: 39.2, y: 200.8, maxW: 80 },
    accountNumber: { x: 51.9, y: 208.1, maxW: 80 },
    terms: { x: 17.8, y: 216.0, maxW: 175 },
  },

  notes: {
    title: { x: 16.0, y: 248.0 },
    body: { x: 16.0, y: 253.0, maxW: 178, lineH: 4.2, maxLines: 8 },
  },
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
  const lines = doc.splitTextToSize(text, maxWidth) as string[];

  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = fitSingleLine(doc, clipped[maxLines - 1], maxWidth, opts);
  return clipped;
}

function splitAddressLines(address?: string): string[] {
  if (!address?.trim()) return [];
  return address
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeLineItem(item: InvoiceLineItem): InvoiceLineItem {
  return {
    description: clean(item.description, "Vehicle transportation"),
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? 0),
    vatRate: typeof item.vatRate === "number" ? item.vatRate : undefined,
  };
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

function getVisibleItems(data: InvoiceData): InvoiceLineItem[] {
  if (data.lineItems.length > 0) {
    return data.lineItems.slice(0, POS.table.maxRows).map(normalizeLineItem);
  }

  return [
    {
      description: getFallbackDescription(data),
      quantity: 1,
      unitPrice: 0,
    },
  ];
}

function getSubtotal(data: InvoiceData): number {
  return data.lineItems.reduce((sum, rawItem) => {
    const item = normalizeLineItem(rawItem);
    return sum + item.quantity * item.unitPrice;
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

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
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

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

function addTemplateBackground(doc: jsPDF, templateData: string): void {
  const format = detectImageFormat(templateData);
  doc.addImage(templateData, format, 0, 0, PAGE_W, PAGE_H);
}

function drawInvoiceMeta(doc: jsPDF, data: InvoiceData): void {
  const displayInvoiceNo = data.invoiceNumber.startsWith("INV-")
    ? data.invoiceNumber
    : `INV-${data.invoiceNumber}`;

  setText(doc, { size: 10.5, style: "bold", color: WHITE });
  doc.text(
    fitSingleLine(doc, displayInvoiceNo, POS.invoiceNoTopRight.maxW, {
      size: 10.5,
      style: "bold",
      color: WHITE,
    }),
    POS.invoiceNoTopRight.x,
    POS.invoiceNoTopRight.y,
    { align: "right" }
  );

  setText(doc, { size: 9.5, style: "normal", color: DARK });
  doc.text(
    fitSingleLine(doc, displayInvoiceNo, POS.leftCard.invoiceNo.maxW, {
      size: 9.5,
      style: "normal",
      color: DARK,
    }),
    POS.leftCard.invoiceNo.x,
    POS.leftCard.invoiceNo.y
  );

  doc.text(
    fitSingleLine(doc, safeDate(data.issueDate), POS.leftCard.date.maxW, {
      size: 9.5,
      style: "normal",
      color: DARK,
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

    setText(doc, {
      size: isFirst ? 9.3 : 9.1,
      style: isFirst ? "bold" : "normal",
      color: DARK,
    });

    doc.text(
      fitSingleLine(doc, line, target.maxW, {
        size: isFirst ? 9.3 : 9.1,
        style: isFirst ? "bold" : "normal",
        color: DARK,
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
    const qty = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const lineTotal = qty * unitPrice;

    setText(doc, { size: 8.8, style: "normal", color: DARK });
    doc.text(
      fitSingleLine(
        doc,
        clean(item.description, getFallbackDescription(data)),
        POS.table.description.maxW,
        { size: 8.8, style: "normal", color: DARK }
      ),
      POS.table.description.x,
      y
    );

    setText(doc, { size: 8.8, style: "bold", color: DARK });
    doc.text(String(qty), POS.table.qty.x, y, { align: "center" });
    doc.text(money(unitPrice), POS.table.rate.x, y, { align: "right" });
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
      color: DARK,
    }),
    POS.payment.bank.x,
    POS.payment.bank.y
  );

  setText(doc, { size: 9.0, style: "bold", color: DARK });
  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.accountName, POS.payment.accountName.maxW, {
      size: 9.0,
      style: "bold",
      color: DARK,
    }),
    POS.payment.accountName.x,
    POS.payment.accountName.y
  );

  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.sortCode, POS.payment.sortCode.maxW, {
      size: 9.0,
      style: "bold",
      color: DARK,
    }),
    POS.payment.sortCode.x,
    POS.payment.sortCode.y
  );

  setText(doc, { size: 9.0, style: "normal", color: DARK });
  doc.text(
    fitSingleLine(doc, AXENTRA_BANK.accountNumber, POS.payment.accountNumber.maxW, {
      size: 9.0,
      style: "normal",
      color: DARK,
    }),
    POS.payment.accountNumber.x,
    POS.payment.accountNumber.y
  );

  const termsText = data.paymentTerms?.trim()
    ? `${data.paymentTerms.trim()} Please use invoice number as payment reference.`
    : AXENTRA_BANK.paymentTermsText;

  const lines = clipLines(doc, termsText, POS.payment.terms.maxW, 2, {
    size: 8.6,
    style: "normal",
    color: DARK,
  });

  if (lines.length > 0) {
    const prefix = "Payable within 7 days.";

    if (lines[0].startsWith(prefix)) {
      setText(doc, { size: 8.6, style: "bold", color: DARK });
      doc.text(prefix, POS.payment.terms.x, POS.payment.terms.y);

      const rest = lines[0].slice(prefix.length).trim();
      if (rest) {
        setText(doc, { size: 8.6, style: "normal", color: DARK });
        doc.text(rest, POS.payment.terms.x + 40.5, POS.payment.terms.y);
      }
    } else {
      setText(doc, { size: 8.6, style: "normal", color: DARK });
      doc.text(lines[0], POS.payment.terms.x, POS.payment.terms.y);
    }

    if (lines[1]) {
      setText(doc, { size: 8.6, style: "normal", color: DARK });
      doc.text(lines[1], POS.payment.terms.x, POS.payment.terms.y + 4.2);
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

  const templateData = await loadImageAsDataUrl(TEMPLATE_PATH);
  if (!templateData) {
    throw new Error(`Missing invoice template at ${TEMPLATE_PATH}`);
  }

  addTemplateBackground(doc, templateData);
  drawInvoiceMeta(doc, data);
  drawBillTo(doc, data);
  drawLineItems(doc, data);
  drawTotals(doc, data);
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