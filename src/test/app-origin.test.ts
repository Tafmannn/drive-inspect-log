import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pickAppOrigin } from "../../supabase/functions/_shared/appOrigin";

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
    expect(pickAppOrigin(null, null, "https://evil.vercel.app")).toBeNull();
    expect(pickAppOrigin("", null, "https://axentra-app.vercel.app.evil.com")).toBeNull();
  });

  it("production origin is accepted by default", () => {
    expect(pickAppOrigin(null, null, "https://axentra-app.vercel.app")).toBe("https://axentra-app.vercel.app");
  });

  it("explicit allow-list replaces the default", () => {
    const csv = "https://a.example.com, https://b.example.com";
    expect(pickAppOrigin(null, csv, "https://b.example.com")).toBe("https://b.example.com");
    expect(pickAppOrigin(null, csv, "https://axentra-app.vercel.app")).toBeNull();
  });

  it("non-https and junk are refused", () => {
    expect(pickAppOrigin("http://app.example.com", null, null)).toBeNull();
    expect(pickAppOrigin(null, "http://localhost:5173", "http://localhost:5173")).toBeNull();
    expect(pickAppOrigin(null, null, "javascript:alert(1)")).toBeNull();
    expect(pickAppOrigin(null, null, null)).toBeNull();
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
