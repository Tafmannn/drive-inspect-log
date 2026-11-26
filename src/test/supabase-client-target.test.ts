import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSupabaseTarget, projectRefFromUrl } from "@/lib/supabaseTarget";

// The browser client must refuse to start (fail closed) whenever the target
// check fails, and must start normally for a valid production or staging env.
const PROD_URL = "https://lynkvfduzqdyvlzgriyh.supabase.co";
const STG_URL = "https://mfedxybzajdgavzmajkl.supabase.co";
const jwt = (claims: object) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".sig";

async function loadClient(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("@/integrations/supabase/client");
}

describe("supabase client — runtime target guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("starts for a production build without VITE_APP_ENV", async () => {
    const mod = await loadClient({ VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", VITE_APP_ENV: "" });
    expect(typeof mod.supabase.from).toBe("function");
  });

  it("starts for a correct staging build", async () => {
    const mod = await loadClient({ VITE_SUPABASE_URL: STG_URL, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", VITE_APP_ENV: "staging" });
    expect(typeof mod.supabase.from).toBe("function");
  });

  it("refuses to start when a staging build points at production", async () => {
    await expect(
      loadClient({ VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", VITE_APP_ENV: "staging" }),
    ).rejects.toThrow(/Refusing to start: .*requires the staging project/);
  });

  it("refuses to start with a secret key", async () => {
    await expect(
      loadClient({ VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x", VITE_APP_ENV: "" }),
    ).rejects.toThrow(/Refusing to start: a secret key/);
  });

  it("refuses to start with missing env", async () => {
    await expect(
      loadClient({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" }),
    ).rejects.toThrow(/Missing VITE_SUPABASE_URL/);
  });
});

describe("supabaseTarget — remaining branches", () => {
  it("treats a malformed JWT-shaped key as opaque (no crash, no claims)", () => {
    expect(checkSupabaseTarget({ url: PROD_URL, key: "a.!!!notbase64!!!.c" }).ok).toBe(true);
  });

  it("rejects a declared environment without a supabase.co URL", () => {
    const r = checkSupabaseTarget({ url: "http://localhost:54321", key: "sb_publishable_x", appEnv: "staging" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not a https:\/\/<ref>\.supabase\.co URL/);
  });

  it("allows a local Supabase when no environment is declared", () => {
    expect(checkSupabaseTarget({ url: "http://localhost:54321", key: "sb_publishable_x" }).ok).toBe(true);
  });

  it("rejects an unsupported VITE_APP_ENV and a missing key", () => {
    expect(checkSupabaseTarget({ url: PROD_URL, key: "sb_publishable_x", appEnv: "qa" }).errors.join(" ")).toMatch(/unsupported VITE_APP_ENV qa/);
    expect(checkSupabaseTarget({ url: PROD_URL, key: "" }).errors.join(" ")).toMatch(/PUBLISHABLE_KEY is missing/);
  });

  it("requires the production project for VITE_APP_ENV=production", () => {
    expect(checkSupabaseTarget({ url: STG_URL, key: jwt({ ref: "mfedxybzajdgavzmajkl", role: "anon" }), appEnv: "production" }).ok).toBe(false);
  });

  it("never matches a non-URL", () => {
    expect(projectRefFromUrl("not a url")).toBeNull();
    expect(projectRefFromUrl(undefined)).toBeNull();
  });
});
