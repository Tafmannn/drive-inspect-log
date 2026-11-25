import { describe, expect, it } from "vitest";
import { invoiceEmailSubject, renderInvoiceEmailHtml } from "../../supabase/functions/_shared/invoiceEmail";

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

describe("Credit note email", () => {
  it("uses the stored document type, labels the credit correctly and never asks for payment", () => {
    const html = renderInvoiceEmailHtml({ ...base, documentType: "credit_note", invoiceNumber: "CN-0012", total: -300, packHref: undefined });
    expect(invoiceEmailSubject("CN-0012", "credit_note")).toBe("Axentra Credit Note CN-0012");
    expect(html).toContain("Please find your credit note");
    expect(html).toContain("Credit Note date:");
    expect(html).toContain("Total credit");
    expect(html).toContain("£300.00");
    expect(html).toContain("Download Credit Note PDF");
    expect(html).toContain("No payment is requested");
    expect(html).not.toContain("Amount due");
    expect(html).not.toContain("Due date:");
    expect(html).not.toContain("payment reference");
    expect(html).not.toContain("Download Invoice PDF");
    expect(html).not.toContain("Complete Credit Note Pack");
    expect(html).not.toContain("£-300.00");
  });

  it("only includes a credit note pack if one is available", () => {
    const html = renderInvoiceEmailHtml({ ...base, documentType: "credit_note", total: -300 });
    expect(html).toContain("Download Complete Credit Note Pack (ZIP)");
    expect(html).toContain('href="' + base.packHref + '"');
    expect(html).not.toContain("Download Complete Invoice Pack");
  });

  it("preserves invoice wording including legacy document type and due date", () => {
    const html = renderInvoiceEmailHtml(base);
    expect(invoiceEmailSubject(base.invoiceNumber, null)).toBe("Axentra Invoice AX26-1007");
    expect(invoiceEmailSubject("CN-0012", "invoice")).toBe("Axentra Invoice CN-0012");
    expect(html).toContain("Amount due");
    expect(html).toContain("Due date:");
    expect(html).toContain("payment reference");
    expect(html).toContain("Download Invoice PDF");
    expect(html).not.toContain("Total credit");
  });
});
