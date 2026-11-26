import { describe, expect, it } from "vitest";
import { renderEmailBrandHeader, emailBrandColour } from "../../supabase/functions/_shared/emailBrand";
import { renderInvoiceEmailHtml } from "../../supabase/functions/_shared/invoiceEmail";
import { renderActionEmailHtml } from "../../supabase/functions/_shared/actionEmail";
import { renderPodEmail, resolveLightEmailLogoUrl } from "../../supabase/functions/_shared/podEmail";
import { renderStatusEmail } from "../../supabase/functions/_shared/customerStatusEmail";

const app = "https://axentra-app.vercel.app";
const logoUrl = app + "/axentra-logo.png";
const operator = { name: "Axentra Vehicles", logoUrl, primaryColour: "#0052CC" };
const header = renderEmailBrandHeader(operator.name, logoUrl);
const link = app + "/example";

describe("Shared Axentra transactional identity", () => {
  const invoice = renderInvoiceEmailHtml({ invoiceNumber: "AX-123", clientName: "Example", total: 150, issueDate: "2026-11-25", dueDate: null, downloadHref: link, packHref: link, logoUrl });
  const action = renderActionEmailHtml({ firstName: "Example", introHtml: "Test", buttonLabel: "Continue", actionLink: link, noteHtml: "Test note", logoUrl });
  const statusEmails = (["collected", "delivered", "aborted"] as const).map(event => ({ label: event, html: renderStatusEmail({ event, operator, job: { reg: "AB12CDE" }, portalUrl: link }).html }));
  const reportEmails = (["collection", "delivery"] as const).map(kind => ({ label: kind, html: renderPodEmail({ kind, operator, job: { ref: "AX-1", reg: "AB12CDE" }, podUrl: link }).html }));
  it.each([{ label: "invoice", html: invoice }, { label: "account action", html: action }, ...statusEmails, ...reportEmails])("$label uses the identical logo header and palette", ({ html }) => {
    expect(html).toContain(header);
    expect(html).toContain("#F4F7FA");
    expect(html).toContain("#172F52");
    expect(html).toContain("#2B7DC9");
    expect(html).toContain('max-width:480px');
  });
  it("uses the canonical light mark even when Axentra has its old logo configured", () => {
    expect(resolveLightEmailLogoUrl("Axentra Vehicles ", "/email/axentra-logo-email.jpg", app)).toBe(logoUrl);
    expect(resolveLightEmailLogoUrl("Axentra", null, app)).toBe(logoUrl);
    expect(emailBrandColour("Axentra", "#0052CC")).toBe("#2B7DC9");
  });
  it("preserves third-party branding rather than showing the Axentra mark", () => {
    expect(resolveLightEmailLogoUrl("Another Operator", "https://example.com/logo.png", app)).toBe("https://example.com/logo.png");
    expect(resolveLightEmailLogoUrl("Another Operator", null, app)).toBeNull();
    expect(emailBrandColour("Another Operator", "#123456")).toBe("#123456");
    const custom = renderEmailBrandHeader("Another Operator", "https://example.com/logo.png");
    expect(custom).toContain("Another Operator");
    expect(custom).not.toContain("AXENTRA");
  });
  it("has a readable logo fallback and rejects unsafe image URLs", () => {
    const fallback = renderEmailBrandHeader("Axentra", "javascript:alert(1)");
    expect(fallback).toContain("AXENTRA");
    expect(fallback).not.toContain("<img");
  });
});
