/**
 * Phase 1 of the job-pricing split (migration 20261121100000): the table is admin-only, the data is
 * copied without ever overwriting, and the mirror copies only what changed. These tests read the
 * migration and its rollback so the rules can't be loosened by accident.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOB_PRICING_FIELDS } from "@/lib/jobPricingFields";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const sql = read("supabase/migrations/20261121100000_job_pricing_table.sql");
const down = read("supabase/rollback/20261121100000_job_pricing_table.down.sql");
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = code(sql);

/** One statement starting at `marker`, up to its own semicolon (the first one outside a function body). */
function statement(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} exists`).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf(";", start) + 1);
}

describe("the table", () => {
  it("has exactly the seven price fields, plus the job, its organisation and timestamps", () => {
    const body = statement(up, "CREATE TABLE IF NOT EXISTS public.job_pricing");
    for (const f of JOB_PRICING_FIELDS) expect(body, f).toContain(f);
    expect(body).toMatch(/job_id\s+uuid PRIMARY KEY REFERENCES public\.jobs\(id\) ON DELETE CASCADE/);
    expect(body).toMatch(/org_id\s+uuid NOT NULL/);
  });

  it("keeps the same column types as the jobs table it copies from", () => {
    const body = statement(up, "CREATE TABLE IF NOT EXISTS public.job_pricing");
    expect(body).toMatch(/total_price\s+numeric,/);
    expect(body).toMatch(/admin_rate\s+numeric\(10,2\)/);
    expect(body).toMatch(/pricing_metadata\s+jsonb/);
    expect(body).toMatch(/pricing_suggestion_used_at\s+timestamptz/);
    expect(body).toMatch(/pricing_suggestion_used_by\s+uuid/);
  });
});

describe("who can see it", () => {
  const OPS = ["select", "insert", "update", "delete"];

  it("has row-level security on, and one rule per action", () => {
    expect(up).toContain("ALTER TABLE public.job_pricing ENABLE ROW LEVEL SECURITY");
    for (const op of OPS) {
      expect(up).toContain(`DROP POLICY IF EXISTS job_pricing_${op}_admin ON public.job_pricing;`);
      expect(up).toContain(`CREATE POLICY job_pricing_${op}_admin ON public.job_pricing FOR ${op.toUpperCase()} TO authenticated`);
    }
  });

  it("every rule needs an admin or the super admin, in the same organisation (the super admin sees all)", () => {
    for (const op of OPS) {
      const p = statement(up, `CREATE POLICY job_pricing_${op}_admin`);
      const halves = op === "update" ? 2 : 1; // an update rule checks the old row and the new row
      const count = (needle: string) => p.split(needle).length - 1;
      expect(count("public.is_super_admin()"), `${op}: super admin`).toBe(halves);
      expect(count("(public.is_admin_or_super_admin() AND org_id = public.user_org_id())"), `${op}: admin in the same organisation`).toBe(halves);
    }
  });

  it("never lets a driver in: no rule mentions drivers, permissions or ownership of a job", () => {
    for (const op of OPS) {
      const p = statement(up, `CREATE POLICY job_pricing_${op}_admin`);
      expect(p).not.toMatch(/driver|user_has_permission|driver_owns_job/i);
    }
  });

  it("an update rule checks both the old and the new row", () => {
    const p = statement(up, "CREATE POLICY job_pricing_update_admin");
    expect(p).toContain("USING (");
    expect(p).toContain("WITH CHECK (");
  });

  it("signed-out visitors get nothing", () => {
    expect(up).toContain("REVOKE ALL ON public.job_pricing FROM PUBLIC, anon;");
    expect(up).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_pricing TO authenticated;");
  });
});

describe("the copy and the mirror", () => {
  it("copies every job that has any of the seven fields set, and never overwrites an existing row", () => {
    const copy = statement(up, "INSERT INTO public.job_pricing");
    for (const f of JOB_PRICING_FIELDS) expect(copy, f).toContain(`j.${f}`);
    expect(copy).toContain("ON CONFLICT (job_id) DO NOTHING");
    expect(copy).not.toMatch(/DO UPDATE/);
  });

  it("the mirror is security definer, locked to a fixed search path, and not callable by users", () => {
    const fn = up.slice(up.indexOf("CREATE OR REPLACE FUNCTION public.mirror_job_pricing_from_jobs"));
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path TO 'public'/);
    expect(up).toContain("REVOKE ALL ON FUNCTION public.mirror_job_pricing_from_jobs() FROM PUBLIC, anon, authenticated;");
  });

  it("on update, copies a column only when it actually changed", () => {
    for (const f of JOB_PRICING_FIELDS) {
      expect(up, f).toContain(`${f} = CASE WHEN OLD.${f} IS DISTINCT FROM NEW.${f} THEN NEW.${f} ELSE public.job_pricing.${f} END`);
    }
  });

  it("only fires when one of the seven fields is set (insert) or changed (update)", () => {
    const ins = statement(up, "CREATE TRIGGER trg_mirror_job_pricing_ins");
    const upd = statement(up, "CREATE TRIGGER trg_mirror_job_pricing_upd");
    for (const f of JOB_PRICING_FIELDS) {
      expect(ins, f).toContain(`NEW.${f} IS NOT NULL`);
      expect(upd, f).toContain(`OLD.${f} IS DISTINCT FROM NEW.${f}`);
      expect(upd, f).toMatch(new RegExp(`UPDATE OF[^;]*\\b${f}\\b`));
    }
  });

  it("changes nothing on jobs: no column is altered, dropped or cleared", () => {
    expect(up).not.toMatch(/ALTER TABLE public\.jobs/);
    expect(up).not.toMatch(/UPDATE public\.jobs/);
    expect(up).not.toMatch(/DROP COLUMN/i);
  });
});

describe("the rollback", () => {
  it("removes the mirror and the table, in one transaction, and says how to copy edits back", () => {
    const d = code(down);
    expect(d).toMatch(/^\s*BEGIN;/);
    expect(d).toMatch(/COMMIT;\s*$/);
    expect(d).toContain("DROP TRIGGER IF EXISTS trg_mirror_job_pricing_ins ON public.jobs;");
    expect(d).toContain("DROP TRIGGER IF EXISTS trg_mirror_job_pricing_upd ON public.jobs;");
    expect(d).toContain("DROP FUNCTION IF EXISTS public.mirror_job_pricing_from_jobs();");
    expect(d).toContain("DROP TABLE IF EXISTS public.job_pricing;");
    expect(d).not.toMatch(/ALTER TABLE public\.jobs/);
    expect(down).toMatch(/copy them back first/);
  });
});
