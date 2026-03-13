import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MARGIN = 20;
const ACCENT = [33, 37, 41] as const;
const ACCENT_LIGHT = [248, 248, 248] as const;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - MARGIN) {
    doc.addPage();
    return MARGIN + 10;
  }
  return y;
}

function safeDate(iso: string | null | undefined): string {
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

  const logoData = await loadImageAsBase64("/axentra-logo-dark.png").catch(() => null)
    ?? await loadImageAsBase64("/axentra-logo.png").catch(() => null);

  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageWidth, 38, "F");

  if (logoData) {
    try { doc.addImage(logoData, "PNG", MARGIN, 5, 32, 20); } catch { /* skip */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", pageWidth - MARGIN, 16, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text("AXENTRA VEHICLE LOGISTICS", pageWidth - MARGIN, 23, { align: "right" });
  doc.text("axentravehicles.com", pageWidth - MARGIN, 29, { align: "right" });

  let y = 48;
  const halfW = (contentWidth - 10) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("BILL TO", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text(data.clientName, MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  if (data.clientCompany) { doc.text(data.clientCompany, MARGIN, y); y += 4.5; }
  if (data.clientEmail) { doc.text(data.clientEmail, MARGIN, y); y += 4.5; }
  if (data.clientAddress) {
    const addrLines = doc.splitTextToSize(data.clientAddress, halfW);
    doc.text(addrLines, MARGIN, y);
    y += addrLines.length * 4.5;
  }

  const rightX = MARGIN + halfW + 10;
  let ry = 48;
  const detailRows = [
    ["Invoice No.", `#${data.invoiceNumber}`],
    ["Issue Date", safeDate(data.issueDate)],
    ["Due Date", data.dueDate ? safeDate(data.dueDate) : "On Receipt"],
    ["Payment Terms", data.paymentTerms || "Net 30"],
    ...(data.jobRef ? [["Job Ref.", data.jobRef]] : []),
    ...(data.vehicleReg ? [["Vehicle", data.vehicleReg]] : []),
  ];

  for (const [label, value] of detailRows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(label, rightX, ry);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ACCENT);
    doc.text(value, pageWidth - MARGIN, ry, { align: "right" });
    ry += 6;
  }

  y = Math.max(y, ry) + 10;

  if (data.route) {
    doc.setFillColor(...ACCENT_LIGHT);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(MARGIN, y - 3, contentWidth, 10, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Route: ${data.route}`, MARGIN + 4, y + 3.5);
    y += 14;
  }

  y = ensureSpace(doc, y, 30);
  const vatRate = data.vatRate ?? 20;
  const rows = data.lineItems.map((item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return [
      item.description,
      String(item.quantity),
      `£${item.unitPrice.toFixed(2)}`,
      `£${lineTotal.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    headStyles: {
      fillColor: [...ACCENT] as [number, number, number],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [...ACCENT_LIGHT] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: contentWidth - 75 },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 27, halign: "right", fontStyle: "bold" },
    },
    head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: rows,
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  const subtotal = data.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;
  const totalsX = pageWidth - MARGIN - 70;
  const totalsValueX = pageWidth - MARGIN;

  y = ensureSpace(doc, y, 40);

  const totalsRows: [string, string, boolean][] = [
    ["Subtotal", `£${subtotal.toFixed(2)}`, false],
    [`VAT (${vatRate}%)`, `£${vatAmount.toFixed(2)}`, false],
    ["TOTAL DUE", `£${total.toFixed(2)}`, true],
  ];

  for (const [label, value, bold] of totalsRows) {
    if (bold) {
      doc.setFillColor(...ACCENT);
      doc.rect(totalsX - 4, y - 4.5, 70 + 4, 10, "F");
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(80, 80, 80);
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 9);
    doc.text(label, totalsX, y);
    doc.text(value, totalsValueX, y, { align: "right" });
    y += bold ? 12 : 7;
  }

  doc.setTextColor(80, 80, 80);
  y += 6;

  if (data.notes) {
    y = ensureSpace(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...ACCENT);
    doc.text("Notes", MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    const noteLines = doc.splitTextToSize(data.notes, contentWidth);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 4.5 + 8;
  }

  y = ensureSpace(doc, y, 30);
  doc.setFillColor(240, 242, 245);
  doc.setDrawColor(220, 220, 225);
  doc.roundedRect(MARGIN, y, contentWidth, 28, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text("Payment Information", MARGIN + 5, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(8);
  doc.text("Bank: Lloyds Bank", MARGIN + 5, y + 14);
  doc.text("Account Name: Axentra Vehicle Logistics Ltd", MARGIN + 5, y + 19);
  doc.text("Please use invoice number as payment reference.", MARGIN + 5, y + 24);
  y += 34;

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...ACCENT);
    doc.rect(0, pageH - 12, pageWidth, 12, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text("Axentra Vehicle Logistics  •  axentravehicles.com  •  info@axentravehicles.com", pageWidth / 2, pageH - 4.5, { align: "center" });
    doc.setTextColor(130, 130, 130);
    doc.text(`Page ${p}/${totalPages}`, pageWidth - MARGIN, pageH - 4.5, { align: "right" });
  }

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const blob = await generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AXENTRA_INV_${data.invoiceNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
