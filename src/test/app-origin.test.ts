import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isLovableHost, pickAppOrigin } from "../../supabase/functions/_shared/appOrigin";

// request-password-reset is unauthenticated and used the request Origin as the
// recovery redirect. A forged Origin on *.vercel.app could receive a victim's
// recovery token if Supabase's allow-list has a wildcard. Origin must only be
// honoured when explicitly allowed.

describe("pickAppOrigin", () => {
  it("APP_URL wins over any Origin", () => {
    expect(pickAppOrigin("https://app.example.com/x", null, "https://evil.vercel.app"))
      .toBe("https://app.example.com");
  });

  it("forged Origin is ignored without APP_URL", () => {
    // falls back to the fixed production origin, never the forged one
    expect(pickAppOrigin(null, null, "https://evil.vercel.app")).toBe("https://axentra-app.vercel.app");
    expect(pickAppOrigin("", null, "https://axentra-app.vercel.app.evil.com")).toBe("https://axentra-app.vercel.app");
  });

  it("production origin is accepted by default", () => {
    expect(pickAppOrigin(null, null, "https://axentra-app.vercel.app")).toBe("https://axentra-app.vercel.app");
  });

  it("explicit allow-list replaces the default", () => {
    const csv = "https://a.example.com, https://b.example.com";
    expect(pickAppOrigin(null, csv, "https://b.example.com")).toBe("https://b.example.com");
    // not in the explicit list -> the list's first (canonical) entry
    expect(pickAppOrigin(null, csv, "https://axentra-app.vercel.app")).toBe(new URL(csv.split(",")[0].trim()).origin);
  });

  it("never links to a Lovable preview, even if APP_URL or the allow-list says so", () => {
    const prod = "https://axentra-app.vercel.app";
    expect(pickAppOrigin("https://axentraapp.lovable.app", null, null)).toBe(prod);
    expect(pickAppOrigin(null, null, "https://axentraapp.lovable.app")).toBe(prod);
    expect(pickAppOrigin(null, "https://axentraapp.lovable.app,https://app.example.com", "https://axentraapp.lovable.app")).toBe("https://app.example.com");
    expect(pickAppOrigin("https://id-preview--abc.lovableproject.com", null, null)).toBe(prod);
    expect(isLovableHost("https://axentraapp.lovable.app")).toBe(true);
    expect(isLovableHost("https://notlovable.app")).toBe(false);
  });

  it("non-https and junk are refused", () => {
    const prod = "https://axentra-app.vercel.app";
    expect(pickAppOrigin("http://app.example.com", null, null)).toBe(prod);
    expect(pickAppOrigin(null, "http://localhost:5173", "http://localhost:5173")).toBe(prod);
    expect(pickAppOrigin(null, null, "javascript:alert(1)")).toBe(prod);
    expect(pickAppOrigin(null, null, null)).toBe(prod);
  });
});

describe("email link builders use the guarded resolver", () => {
  for (const f of [
    "supabase/functions/_shared/brandedEmail.ts",
    "supabase/functions/notify-customers/index.ts",
    "supabase/functions/send-pod-email/index.ts",
  ]) {
    it(f, () => {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("pickAppOrigin(");
      expect(src).not.toMatch(/APP_URL"\)\s*\|\|\s*req\.headers\.get\("origin"\)/);
    });
  }
});
