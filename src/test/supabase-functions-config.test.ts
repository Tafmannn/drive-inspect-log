import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";

// Production runs every Edge Function with verify_jwt = false and enforces the
// caller's identity in code. `supabase functions deploy` defaults verify_jwt to
// true for any function not declared in config.toml, which would make the
// gateway reject publishable (non-JWT) keys. Every function must be declared.
describe("supabase/config.toml — Edge Function gateway settings", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  const functions = readdirSync("supabase/functions").filter(
    (name) => !name.startsWith("_") && statSync(`supabase/functions/${name}`).isDirectory(),
  );

  it("finds the repository's functions", () => {
    expect(functions.length).toBeGreaterThanOrEqual(20);
  });

  it.each(functions)("%s declares verify_jwt = false", (name) => {
    const block = new RegExp(`\\[functions\\.${name.replace(/-/g, "\\-")}\\]\\s*\\nverify_jwt = false`);
    expect(config).toMatch(block);
  });

  it("pins the local database to production's major version", () => {
    expect(config).toMatch(/\[db\]\s*\nmajor_version = 17/);
  });
});
