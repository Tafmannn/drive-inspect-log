import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deliveryEnvironment, emailDeliveryDecision } from "../../supabase/functions/_shared/deliveryGuard";

const PROD = "https://lynkvfduzqdyvlzgriyh.supabase.co";
const STAGING = "https://mfedxybzajdgavzmajkl.supabase.co";

describe("deliveryGuard — staging can never e-mail real people", () => {
  it("classifies environments by exact project host only", () => {
    expect(deliveryEnvironment(PROD)).toBe("production");
    expect(deliveryEnvironment(STAGING)).toBe("staging");
    expect(deliveryEnvironment("https://lynkvfduzqdyvlzgriyh.supabase.co.evil.test")).toBe("unknown");
    expect(deliveryEnvironment("https://evil.test/lynkvfduzqdyvlzgriyh.supabase.co")).toBe("unknown");
    expect(deliveryEnvironment(undefined)).toBe("unknown");
    expect(deliveryEnvironment("not a url")).toBe("unknown");
  });

  it("production behaviour is unchanged", () => {
    expect(emailDeliveryDecision("customer@example.com", { supabaseUrl: PROD }).send).toBe(true);
  });

  it("staging only delivers to the reserved test domain by default", () => {
    expect(emailDeliveryDecision("zz-a-client@axentra-staging.test", { supabaseUrl: STAGING }).send).toBe(true);
    const real = emailDeliveryDecision("customer@example.com", { supabaseUrl: STAGING });
    expect(real.send).toBe(false);
    expect(real.reason).toBe("STAGING_RECIPIENT_NOT_ALLOWLISTED");
    expect(emailDeliveryDecision("x@axentra-staging.test.evil.com", { supabaseUrl: STAGING }).send).toBe(false);
    expect(emailDeliveryDecision("not-an-address", { supabaseUrl: STAGING }).send).toBe(false);
  });

  it("staging allowlist accepts explicit domains and full addresses only", () => {
    const env = { supabaseUrl: STAGING, stagingAllowlist: "qa.example.org, owner@example.com" };
    expect(emailDeliveryDecision("tester@qa.example.org", env).send).toBe(true);
    expect(emailDeliveryDecision("Owner@Example.com", env).send).toBe(true);
    expect(emailDeliveryDecision("someone-else@example.com", env).send).toBe(false);
  });

  it("unknown environments fail closed", () => {
    const d = emailDeliveryDecision("customer@example.com", { supabaseUrl: "https://other.supabase.co" });
    expect(d).toMatchObject({ send: false, reason: "UNKNOWN_ENVIRONMENT_EMAIL_SUPPRESSED" });
  });

  it("every Resend call site is behind the guard", () => {
    for (const f of [
      "supabase/functions/_shared/brandedEmail.ts",
      "supabase/functions/send-invoice-email/index.ts",
      "supabase/functions/send-pod-email/index.ts",
      "supabase/functions/notify-customers/index.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      const send = src.indexOf("https://api.resend.com/emails");
      const gate = src.indexOf("emailDeliveryGate(");
      expect(gate, f).toBeGreaterThan(-1);
      expect(gate, f).toBeLessThan(send);
    }
  });
});
