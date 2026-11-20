/**
 * Phase 4 of the job-pricing split (migration 20261121120000): the empty price columns are dropped. These
 * tests read the migration and rollback so its safety rules can't be loosened, and scan the app so nothing
 * still names a dropped column on the jobs table.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { JOB_PRICING_FIELDS } from "@/lib/jobPricingFields";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = code(read("supabase/migrations/20261121120000_job_pricing_drop_columns.sql"));
const down = code(read("supabase/rollback/20261121120000_job_pricing_drop_columns.down.sql"));
const seal = code(read("supabase/migrations/20261121110000_job_pricing_seal.sql"));

function between(text: string, start: string, end: string): string {
  const a = text.indexOf(start);
  expect(a, `${start} exists`).toBeGreaterThan(-1);
  const b = text.indexOf(end, a);
  expect(b, `${end} follows`).toBeGreaterThan(a);
  return text.slice(a, b + end.length);
}

describe("the drop migration", () => {
  it("drops exactly the seven price columns and nothing else, without CASCADE", () => {
    const stmt = between(up, "ALTER TABLE public.jobs", "pricing_suggestion_used_by;");
    for (const f of JOB_PRICING_FIELDS) expect(stmt, f).toContain(`DROP COLUMN IF EXISTS ${f}`);
    expect(stmt.match(/DROP COLUMN/g)).toHaveLength(JOB_PRICING_FIELDS.length);
    expect(up).not.toMatch(/CASCADE/i);
    expect(up).not.toMatch(/DROP TABLE/i);
  });

  it("aborts before dropping if a job still holds a price, or an index or constraint uses a column", () => {
    const guard = between(up, "DO $$", "END $$;");
    expect(guard).toContain("RAISE EXCEPTION 'JOBS_STILL_HOLD_PRICES");
    expect(guard).toContain("RAISE EXCEPTION 'PRICE_COLUMN_HAS_INDEX_OR_CONSTRAINT");
    expect(guard).toContain("pg_index");
    expect(guard).toContain("pg_constraint");
    for (const f of JOB_PRICING_FIELDS) expect(guard, f).toContain(`'${f}'`);
    expect(up.indexOf("JOBS_STILL_HOLD_PRICES")).toBeLessThan(up.indexOf("ALTER TABLE public.jobs"));
  });

  it("removes the seal triggers and functions before the columns", () => {
    for (const t of ["trg_seal_job_pricing_ins", "trg_seal_job_pricing_upd"]) {
      expect(up).toContain(`DROP TRIGGER IF EXISTS ${t} ON public.jobs;`);
      expect(up.indexOf(`DROP TRIGGER IF EXISTS ${t}`)).toBeLessThan(up.indexOf("ALTER TABLE public.jobs"));
    }
    expect(up).toContain("DROP FUNCTION IF EXISTS public.seal_job_pricing_before_update();");
    expect(up).toContain("DROP FUNCTION IF EXISTS public.seal_job_pricing_after_insert();");
  });
});

describe("the rollback", () => {
  it("is one transaction that re-adds every column with its original type", () => {
    expect(down.trim().startsWith("BEGIN;")).toBe(true);
    expect(down.trim().endsWith("COMMIT;")).toBe(true);
    const add = between(down, "ALTER TABLE public.jobs", "pricing_suggestion_used_by uuid;");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS total_price numeric");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS rate_per_mile numeric");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS admin_rate numeric(10,2)");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS caz_ulez_cost numeric");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS pricing_metadata jsonb");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS pricing_suggestion_used_at timestamptz");
    expect(add).toContain("ADD COLUMN IF NOT EXISTS pricing_suggestion_used_by uuid");
  });

  it("restores the phase 3 seal exactly as phase 3 defines it", () => {
    const fn = (t: string, n: string) => between(t, `CREATE OR REPLACE FUNCTION public.${n}()`, "$$;");
    for (const n of ["seal_job_pricing_before_update", "seal_job_pricing_after_insert"]) expect(fn(down, n)).toBe(fn(seal, n));
    for (const n of ["trg_seal_job_pricing_ins", "trg_seal_job_pricing_upd"]) {
      expect(between(down, `CREATE TRIGGER ${n}`, "();")).toBe(between(seal, `CREATE TRIGGER ${n}`, "();"));
    }
  });

  it("re-adds the columns before it recreates the triggers that use them", () => {
    expect(down.indexOf("ADD COLUMN IF NOT EXISTS total_price")).toBeLessThan(down.indexOf("CREATE TRIGGER trg_seal_job_pricing_upd"));
  });
});

describe("the app no longer names a dropped column on the jobs table", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const files = [...walk(resolve(root, "src")), resolve(root, "supabase/functions/mcp/index.ts")].filter(
    (p) => !p.includes("/src/test/") && !p.includes("/src/integrations/supabase/types.ts"),
  );

  it("no jobs select string lists a price column", () => {
    const offenders = files.filter((p) => /select\(\s*(["'`])[^"'`]*\b(total_price|rate_per_mile|admin_rate|caz_ulez_cost|pricing_metadata)\b[^"'`]*\1/.test(readFileSync(p, "utf8"))
      && /from\(["']jobs["']\)/.test(readFileSync(p, "utf8")));
    // job_pricing selects are the only ones allowed to list them
    const real = offenders.filter((p) => {
      const t = readFileSync(p, "utf8");
      return [...t.matchAll(/from\(["']jobs["']\)[\s\S]{0,200}?select\(\s*(["'`])([^"'`]*)\1/g)].some((m) =>
        /\b(total_price|rate_per_mile|admin_rate|caz_ulez_cost|pricing_metadata)\b/.test(m[2]),
      );
    });
    expect(real.map((p) => p.replace(root, ""))).toEqual([]);
  });

  it("the generated jobs types no longer carry the columns", () => {
    const t = read("src/integrations/supabase/types.ts");
    const jobs = between(t, "      jobs: {", "Relationships");
    for (const f of JOB_PRICING_FIELDS) expect(jobs, f).not.toMatch(new RegExp(`\\b${f}\\??:`));
  });

  it("price writers never put a price key into a jobs write", () => {
    const api = read("src/lib/api.ts");
    expect(api).toContain("omitPricingFields(payload)");
    expect(api).toContain("omitPricingFields(input as Record<string, unknown>)");
    expect(read("src/components/JobPriceEditor.tsx")).not.toMatch(/from\(["']jobs["']\)/);
    expect(read("src/components/PricingSuggestionPanel.tsx")).not.toMatch(/from\(["']jobs["']\)/);
  });
});
