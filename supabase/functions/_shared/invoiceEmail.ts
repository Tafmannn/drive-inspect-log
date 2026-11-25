import { renderEmailBrandHeader } from "./emailBrand.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function fmtGbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

export function invoiceEmailSubject(invoiceNumber: string, documentType?: string | null): string {
  return `Axentra ${documentType === "credit_note" ? "Credit Note" : "Invoice"} ${invoiceNumber}`;
}

export function renderInvoiceEmailHtml(opts: {
  invoiceNumber: string;
  documentType?: string | null;
  clientName: string;
  total: number | null;
  issueDate: string;
  dueDate: string | null;
  downloadHref: string;
  packHref?: string;
  logoUrl: string | null;
}): string {
  const { invoiceNumber, clientName, total, issueDate, dueDate, downloadHref, packHref, logoUrl } = opts;
  const isCredit = opts.documentType === "credit_note";
  const documentLabel = isCredit ? "credit note" : "invoice";
  const titleLabel = isCredit ? "Credit Note" : "Invoice";
  const amountLabel = isCredit ? "Total credit" : "Amount due";
  const displayTotal = total != null && isCredit ? Math.abs(total) : total;
  const dueLine = !isCredit && dueDate
    ? `<p style="margin:0 0 4px;"><strong>Due date:</strong> ${escapeHtml(dueDate)}</p>`
    : "";
  const totalLine = displayTotal != null
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;"><tr><td bgcolor="#EEF4FA" style="background:#EEF4FA;border:1px solid #D4E2F0;border-radius:8px;padding:16px;color:#183B60;"><span style="font-size:13px;">${amountLabel}</span><br><strong style="font-size:28px;line-height:1.3;">${escapeHtml(fmtGbp(displayTotal))}</strong></td></tr></table>`
    : `<p style="margin:0 0 24px;"></p>`;
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
  <body style="margin:0;padding:0;background:#F4F7FA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
            ${renderEmailBrandHeader("Axentra Vehicle Logistics", logoUrl)}
            <tr>
              <td style="padding:24px 32px 32px;color:#172F52;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">Dear ${escapeHtml(clientName || "Customer")},</p>
                <p style="margin:0 0 16px;">
                  Please find your ${documentLabel} <strong>${escapeHtml(invoiceNumber)}</strong> below.
                </p>
                <p style="margin:0 0 4px;"><strong>${titleLabel} date:</strong> ${escapeHtml(issueDate)}</p>
                ${dueLine}
                ${totalLine}
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${downloadHref}"
                     style="background:#172F52;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold;display:block;">
                    Download ${titleLabel} PDF
                  </a>
                </p>
                ${packHref ? `<p style="margin:0 0 24px;text-align:center;"><a href="${packHref}" style="background:#2B7DC9;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold;display:block;">Download Complete ${titleLabel} Pack (ZIP)</a></p><p style="margin:0 0 16px;">${isCredit ? "The pack contains the credit note and its supporting documents where applicable." : "The pack contains the invoice and its supporting receipts and proof of delivery where applicable."}</p>` : ""}
                <p style="margin:0 0 16px;color:#576B85;font-size:13px;">Links expire in 30 days.</p>
                <p style="margin:0 0 16px;">${isCredit ? "This credit note records a credit to your account. No payment is requested by this document." : "Payment details are shown on the invoice. Please use the invoice number as your payment reference."}</p>
                <p style="margin:24px 0 0;">Kind regards,<br/>Axentra Vehicle Logistics<br/>info@axentravehicles.com</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
