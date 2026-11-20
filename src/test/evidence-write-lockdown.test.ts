import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync("supabase/migrations/20261121160000_evidence_write_lockdown.sql", "utf8");
const EVIDENCE = ["photos", "inspections", "damage_items", "evidence_items", "qr_confirmations"];

describe("evidence write lock-down — migration contract", () => {
  it("revokes DELETE and TRUNCATE on every evidence table", () => {
    expect(sql).toMatch(/REVOKE DELETE, TRUNCATE ON public\.photos, public\.inspections, public\.damage_items,\s+public\.evidence_items, public\.qr_confirmations FROM anon, authenticated/);
  });
  it("keeps UPDATE where submit_inspection / photo retries need it", () => {
    const upd = sql.match(/REVOKE UPDATE ON ([^;]+) FROM/)![1];
    expect(upd).not.toMatch(/inspections|damage_items|photos/);
  });
  it("QR rows can never be inserted pre-confirmed", () => {
    expect(sql).toContain("confirmed_at IS NULL AND customer_name IS NULL");
  });
  it("photos cannot be moved between jobs/orgs/runs by non-admins", () => {
    expect(sql).toMatch(/NEW\.job_id IS DISTINCT FROM OLD\.job_id[\s\S]*NEW\.run_id IS DISTINCT FROM OLD\.run_id/);
  });
});

// If app code ever starts deleting evidence directly, this migration would
// break it — fail here first.
describe("no client code deletes evidence rows", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? (d.name === "test" ? [] : walk(join(dir, d.name))) : /\.(ts|tsx)$/.test(d.name) ? [join(dir, d.name)] : []);
  }
  it("src/ has no .from(<evidence>)…delete()", () => {
    const offenders = walk("src").filter((f) => {
      const s = readFileSync(f, "utf8");
      return EVIDENCE.some((t) => new RegExp(`from\\(["']${t}["']\\)[\\s\\S]{0,120}\\.delete\\(`).test(s));
    });
    expect(offenders).toEqual([]);
  });
});
