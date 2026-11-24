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

export function renderInvoiceEmailHtml(opts: {
  invoiceNumber: string;
  clientName: string;
  total: number | null;
  issueDate: string;
  dueDate: string | null;
  downloadHref: string;
  packHref?: string;
  logoUrl: string | null;
}): string {
  const { invoiceNumber, clientName, total, issueDate, dueDate, downloadHref, packHref, logoUrl } = opts;
  const dueLine = dueDate
    ? `<p style="margin:0 0 4px;"><strong>Due date:</strong> ${escapeHtml(dueDate)}</p>`
    : "";
  const totalLine = total != null
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;"><tr><td bgcolor="#EEF4FA" style="background:#EEF4FA;border:1px solid #D4E2F0;border-radius:8px;padding:16px;color:#183B60;"><span style="font-size:13px;">Amount due</span><br><strong style="font-size:28px;line-height:1.3;">${escapeHtml(fmtGbp(total))}</strong></td></tr></table>`
    : `<p style="margin:0 0 24px;"></p>`;
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
  <body style="margin:0;padding:0;background:#F4F7FA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:24px 32px 16px;border-bottom:1px solid #D4E2F0;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  ${logoUrl ? `<td style="padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" width="48" alt="Axentra logo" style="display:block;width:48px;height:auto;border:0;"></td>` : ""}
                  <td style="vertical-align:middle;"><span style="color:#172F52;font-size:24px;font-weight:bold;letter-spacing:3px;">AXENTRA</span><br><span style="color:#576B85;font-size:11px;letter-spacing:1px;">VEHICLE LOGISTICS</span></td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;color:#172F52;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">Dear ${escapeHtml(clientName || "Customer")},</p>
                <p style="margin:0 0 16px;">
                  Please find your invoice <strong>${escapeHtml(invoiceNumber)}</strong> below.
                </p>
                <p style="margin:0 0 4px;"><strong>Invoice date:</strong> ${escapeHtml(issueDate)}</p>
                ${dueLine}
                ${totalLine}
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${downloadHref}"
                     style="background:#172F52;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold;display:block;">
                    Download Invoice PDF
                  </a>
                </p>
                ${packHref ? `<p style="margin:0 0 24px;text-align:center;"><a href="${packHref}" style="background:#2B7DC9;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold;display:block;">Download Complete Invoice Pack (ZIP)</a></p><p style="margin:0 0 16px;">The pack contains the invoice and its supporting receipts and proof of delivery where applicable.</p>` : ""}
                <p style="margin:0 0 16px;color:#576B85;font-size:13px;">Links expire in 30 days.</p>
                <p style="margin:0 0 16px;">Payment details are shown on the invoice. Please use the invoice number as your payment reference.</p>
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
