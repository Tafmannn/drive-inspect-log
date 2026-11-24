import { describe, expect, it } from "vitest";
import { renderInvoiceEmailHtml } from "../../supabase/functions/_shared/invoiceEmail";

const base = { invoiceNumber: "AX26-1007", clientName: "Customer & Co", total: 1650.47, issueDate: "2026-11-24", dueDate: "2026-12-24", downloadHref: "https://example.com/invoice.pdf", packHref: "https://example.com/invoice.zip", logoUrl: "https://axentra-app.vercel.app/axentra-logo.png" };
describe("Axentra invoice email branding", () => {
  it("uses the existing logo, light amount card and both download links", () => {
    const html = renderInvoiceEmailHtml(base);
    expect(html).toContain('src="' + base.logoUrl + '"');
    expect(html).toContain('bgcolor="#EEF4FA"');
    expect(html).toContain("£1650.47");
    expect(html).toContain("Customer &amp; Co");
    expect(html).toContain("AX26-1007");
    expect(html).toContain("2026-12-24");
    expect(html).toContain('href="' + base.downloadHref + '"');
    expect(html).toContain('href="' + base.packHref + '"');
    expect(html).toContain("Download Complete Invoice Pack (ZIP)");
    expect(html).toContain("30 days");
  });
  it("keeps a readable wordmark and PDF-only delivery for legacy invoices", () => {
    const html = renderInvoiceEmailHtml({ ...base, logoUrl: null, packHref: undefined });
    expect(html).toContain("AXENTRA");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Download Complete Invoice Pack (ZIP)");
    expect(html).toContain("Download Invoice PDF");
  });
});
