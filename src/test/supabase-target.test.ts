import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkSupabaseTarget, projectRefFromUrl } from "@/lib/supabaseTarget";

const PROD_URL = "https://lynkvfduzqdyvlzgriyh.supabase.co";
const STG_URL = "https://mfedxybzajdgavzmajkl.supabase.co";
const jwt = (claims: object) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".sig";
const STG_ANON = jwt({ iss: "supabase", ref: "mfedxybzajdgavzmajkl", role: "anon" });
const PROD_ANON = jwt({ iss: "supabase", ref: "lynkvfduzqdyvlzgriyh", role: "anon" });

describe("supabaseTarget — staging cannot reach production", () => {
  it("parses project refs strictly", () => {
    expect(projectRefFromUrl(STG_URL)).toBe("mfedxybzajdgavzmajkl");
    expect(projectRefFromUrl("https://mfedxybzajdgavzmajkl.supabase.co.evil.test")).toBeNull();
    expect(projectRefFromUrl("")).toBeNull();
  });

  it("accepts a correct staging build", () => {
    expect(checkSupabaseTarget({ url: STG_URL, key: STG_ANON, appEnv: "staging", gitBranch: "deploy-preview/staging" }).ok).toBe(true);
    expect(checkSupabaseTarget({ url: STG_URL, key: "sb_publishable_abc", appEnv: "staging" }).ok).toBe(true);
  });

  it("rejects a staging build that fell back to the committed production .env", () => {
    const committed = readFileSync(".env", "utf8");
    const url = /VITE_SUPABASE_URL="([^"]+)"/.exec(committed)?.[1];
    const r = checkSupabaseTarget({ url, key: "sb_publishable_x", appEnv: "staging" });
    expect(url).toBe(PROD_URL);
    expect(r.ok).toBe(false);
  });

  it("a staging branch must declare VITE_APP_ENV=staging", () => {
    const r = checkSupabaseTarget({ url: PROD_URL, key: PROD_ANON, gitBranch: "deploy-preview/staging" });
    expect(r.ok).toBe(false);
    expect(checkSupabaseTarget({ url: PROD_URL, key: PROD_ANON, gitBranch: "staging" }).ok).toBe(false);
  });

  it("rejects key/URL project mismatch and secret keys in every environment", () => {
    expect(checkSupabaseTarget({ url: STG_URL, key: PROD_ANON }).ok).toBe(false);
    expect(checkSupabaseTarget({ url: PROD_URL, key: jwt({ ref: "lynkvfduzqdyvlzgriyh", role: "service_role" }) }).ok).toBe(false);
    expect(checkSupabaseTarget({ url: STG_URL, key: "sb_secret_abc" }).ok).toBe(false);
  });

  it("production builds are unchanged (no VITE_APP_ENV needed on main)", () => {
    expect(checkSupabaseTarget({ url: PROD_URL, key: PROD_ANON, gitBranch: "main" }).ok).toBe(true);
    expect(checkSupabaseTarget({ url: PROD_URL, key: "sb_publishable_x", appEnv: "production" }).ok).toBe(true);
    expect(checkSupabaseTarget({ url: STG_URL, key: STG_ANON, appEnv: "production" }).ok).toBe(false);
  });
});
