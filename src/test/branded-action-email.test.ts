import { describe, expect, it } from "vitest";
import { portalInviteIntroHtml, renderActionEmailHtml, SUPPORT_EMAIL } from "../../supabase/functions/_shared/actionEmail";

const base = { firstName: "Terrence", introHtml: "Intro", buttonLabel: "Set up my portal access", actionLink: "https://x.supabase.co/auth/v1/verify?token=abc&type=invite", noteHtml: "Valid 24h" };

describe("Axentra-branded action email", () => {
  it("has the navy logo banner, cobalt button and dark-mode hints", () => {
    const html = renderActionEmailHtml({ ...base, logoUrl: "https://axentra-app.vercel.app/email/axentra-logo-email-dark.png", eyebrow: "Customer portal" });
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain('bgcolor="#08152E"');
    expect(html).toContain('src="https://axentra-app.vercel.app/email/axentra-logo-email-dark.png"');
    expect(html).toMatch(/bgcolor="#1E4FA8"[^>]*>\s*<a href="https:\/\/x\.supabase\.co\/auth\/v1\/verify\?token=abc&amp;type=invite"/);
    expect(html).toContain("Customer portal");
    expect(html).toContain("Hi Terrence,");
    expect(html).toContain(`mailto:${SUPPORT_EMAIL}`);
  });

  it("falls back to a text wordmark without a logo URL, and escapes inputs", () => {
    const html = renderActionEmailHtml({ ...base, firstName: "<b>x</b>", buttonLabel: "Go <now>" });
    expect(html).toContain("AXENTRA");
    expect(html).not.toContain("<img");
    expect(html).toContain("Hi &lt;b&gt;x&lt;/b&gt;,");
    expect(html).toContain("Go &lt;now&gt;");
  });

  it("greets without a name when none is known", () => {
    expect(renderActionEmailHtml({ ...base, firstName: null })).toContain(">Hi,<");
  });
});

describe("portal invite intro", () => {
  it("names the client when it differs from the operator", () => {
    const s = portalInviteIntroHtml("Axentra Vehicles", "Northway Motors");
    expect(s).toContain("<strong>Axentra Vehicles</strong> has set up your customer portal for <strong>Northway Motors</strong>.");
  });
  it("doesn't repeat the operator's own name (the confusing 'for Axentra')", () => {
    const s = portalInviteIntroHtml("Axentra Vehicles", "Axentra");
    expect(s).not.toContain(" for ");
    expect(s).toContain("<strong>Axentra Vehicles</strong> has set up your customer portal.");
  });
  it("escapes names", () => {
    expect(portalInviteIntroHtml("A & B", "<C>")).toContain("A &amp; B");
    expect(portalInviteIntroHtml("A & B", "<C>")).toContain("&lt;C&gt;");
  });
});
