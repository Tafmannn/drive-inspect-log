import { describe, it, expect } from "vitest";
import { classifyTrackedEnv } from "../../release-validation/lib/trackedEnv.mjs";

const jwt = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig_abcdefghij`;

describe("classifyTrackedEnv", () => {
  it("accepts VITE_* keys with an anon JWT", () => {
    const r = classifyTrackedEnv(`VITE_SUPABASE_URL="https://x.supabase.co"\nVITE_SUPABASE_PUBLISHABLE_KEY="${jwt("anon")}"\n`);
    expect(r.ok).toBe(true);
  });
  it("rejects a service_role JWT", () => {
    const r = classifyTrackedEnv(`VITE_KEY=${jwt("service_role")}`);
    expect(r.ok).toBe(false);
  });
  it("rejects non-VITE and secret-named keys", () => {
    const r = classifyTrackedEnv("SUPABASE_SERVICE_ROLE_KEY=abc\n");
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(1);
  });
  it("rejects PEM private keys and ignores comments", () => {
    expect(classifyTrackedEnv("# note\n-----BEGIN PRIVATE KEY-----\n").ok).toBe(false);
    expect(classifyTrackedEnv("# only a comment\n").ok).toBe(true);
  });
});
