import jsPDF from "jspdf";

const TEMPLATE_PATH = "/invoice-template.png";

// COLORS
const DARK: [number, number, number] = [24, 33, 53];
const MID: [number, number, number] = [78, 89, 110];
const BLUE: [number, number, number] = [17, 42, 102];
const WHITE: [number, number, number] = [255, 255, 255];

// BANK DETAILS
const BANK = {
  bankName: "Monzo Bank",
  accountName: "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics",
  sortCode: "04-00-03",
  accountNumber: "24861835",
};

// POSITIONS (LOCKED)
const POS = {
  invoiceNoTopRight: { x: 186.5, y: 30.0 },

  leftCard: {
    invoiceNo: { x: 69.0, y: 75.8 },
    date: { x: 69.0, y: 85.3 },
  },

  rightCard: {
    line1: { x: 113.0, y: 75.5 },
    line2: { x: 113.0, y: 81.5 },
    line3: { x: 113.0, y: 87.5 },
  },

  table: {
    startY: 112.0,
    rowGap: 7.5,
    description: { x: 20.5 },
    qty: { x: 139.0 },
    rate: { x: 165.5 },
    total: { x: 190.0 },
  },

  totals: {
    subtotal: { x: 190.0, y: 145.5 },
    vat: { x: 190.0, y: 153.5 },
    total: { x: 190.0, y: 165.0 },
  },
};

// TYPES
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  clientName: string;
  clientCompany?: string;
  clientAddress?: string;
  lineItems: InvoiceLineItem[];
  vatRate?: number;
}

// HELPERS
function setFont(doc: jsPDF, size: number, style: "normal" | "bold" = "normal", color = DARK) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function money(n: number) {
  return `£${n.toFixed(2)}`;
}

function safeDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function loadImage(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// MAIN
export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const template = await loadImage(TEMPLATE_PATH);

  // BACKGROUND
  doc.addImage(template, "PNG", 0, 0, 210, 297);

  const item = data.lineItems[0];
  const subtotal = item.quantity * item.unitPrice;
  const vat = subtotal * ((data.vatRate ?? 0) / 100);
  const total = subtotal + vat;

  // TOP RIGHT
  setFont(doc, 10.5, "bold", WHITE);
  doc.text(data.invoiceNumber, POS.invoiceNoTopRight.x, POS.invoiceNoTopRight.y, { align: "right" });

  // LEFT CARD
  setFont(doc, 9.5);
  doc.text(data.invoiceNumber, POS.leftCard.invoiceNo.x, POS.leftCard.invoiceNo.y);
  doc.text(safeDate(data.issueDate), POS.leftCard.date.x, POS.leftCard.date.y);

  // BILL TO
  setFont(doc, 9.5, "bold");
  doc.text(data.clientName, POS.rightCard.line1.x, POS.rightCard.line1.y);

  setFont(doc, 9.2);
  if (data.clientCompany)
    doc.text(data.clientCompany, POS.rightCard.line2.x, POS.rightCard.line2.y);

  if (data.clientAddress)
    doc.text(data.clientAddress, POS.rightCard.line3.x, POS.rightCard.line3.y);

  // TABLE
  const y = POS.table.startY;

  setFont(doc, 8.8);
  doc.text(item.description, POS.table.description.x, y);

  setFont(doc, 8.8, "bold");
  doc.text(String(item.quantity), POS.table.qty.x, y, { align: "center" });
  doc.text(money(item.unitPrice), POS.table.rate.x, y, { align: "right" });
  doc.text(money(subtotal), POS.table.total.x, y, { align: "right" });

  // TOTALS
  setFont(doc, 9, "bold");
  doc.text(money(subtotal), POS.totals.subtotal.x, POS.totals.subtotal.y, { align: "right" });
  doc.text(money(vat), POS.totals.vat.x, POS.totals.vat.y, { align: "right" });

  setFont(doc, 13, "bold", BLUE);
  doc.text(money(total), POS.totals.total.x, POS.totals.total.y, { align: "right" });

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData) {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `AXENTRA_INV_${data.invoiceNumber}.pdf`;
  a.click();

  URL.revokeObjectURL(url);
}
