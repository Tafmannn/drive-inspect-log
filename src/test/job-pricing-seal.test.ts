/**
 * Phase 3 of the job-pricing split (migration 20261121110000): the old price columns on `jobs` are emptied
 * and kept empty, any write to them is forwarded, nothing is dropped, and the rollback restores the data.
 * These tests read the migration and rollback so the rules can't be loosened by accident.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOB_PRICING_FIELDS } from "@/lib/jobPricingFields";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = code(read("supabase/migrations/20261121110000_job_pricing_seal.sql"));
const down = code(read("supabase/rollback/20261121110000_job_pricing_seal.down.sql"));
const phase1 = code(read("supabase/migrations/20261121100000_job_pricing_table.sql"));

/** One statement starting at `marker`, up to the first line that is just `$$;` or a plain `;` end. */
function between(text: string, start: string, end: string): string {
  const a = text.indexOf(start);
  expect(a, `${start} exists`).toBeGreaterThan(-1);
  const b = text.indexOf(end, a);
  expect(b, `${end} follows`).toBeGreaterThan(a);
  return text.slice(a, b + end.length);
}

describe("the seal keeps the columns and never drops data", () => {
  it("does not drop a column or the table", () => {
    expect(up).not.toMatch(/DROP COLUMN/i);
    expect(up).not.toMatch(/DROP TABLE/i);
    expect(up).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("empties exactly the seven price fields, in the final clean-up and the insert trigger", () => {
    const cleanup = between(up, "UPDATE public.jobs SET\n  total_price = NULL", "pricing_suggestion_used_by IS NOT NULL;");
    for (const f of JOB_PRICING_FIELDS) expect(cleanup, f).toContain(`${f} = NULL`);
    // Only rows that hold something are rewritten.
    expect(cleanup).toContain("WHERE total_price IS NOT NULL");
  });
});

describe("it proves job_pricing holds everything before emptying anything", () => {
  it("fills gaps without overwriting, then aborts on any disagreement", () => {
    const fill = between(up, "UPDATE public.job_pricing p SET", "p.pricing_suggestion_used_by IS NULL AND j.pricing_suggestion_used_by IS NOT NULL));");
    for (const f of JOB_PRICING_FIELDS) expect(fill, f).toContain(`${f} = COALESCE(p.${f}, j.${f})`);
    const check = between(up, "DO $$\nDECLARE v_bad integer;", "END $$;");
    for (const f of JOB_PRICING_FIELDS) expect(check, f).toContain(`j.${f} IS NOT NULL AND j.${f} IS DISTINCT FROM p.${f}`);
    expect(check).toContain("RAISE EXCEPTION 'JOB_PRICING_MISMATCH");
  });

  it("runs the proof before the columns are emptied", () => {
    expect(up.indexOf("JOB_PRICING_MISMATCH")).toBeLessThan(up.lastIndexOf("UPDATE public.jobs SET"));
    expect(up.indexOf("JOB_PRICING_MISMATCH")).toBeLessThan(up.indexOf("CREATE TRIGGER trg_seal_job_pricing_upd"));
  });
});

describe("the seal triggers", () => {
  const upd = between(up, "CREATE OR REPLACE FUNCTION public.seal_job_pricing_before_update()", "$$;");
  const ins = between(up, "CREATE OR REPLACE FUNCTION public.seal_job_pricing_after_insert()", "$$;");

  it("forward only non-NULL values and never overwrite with NULL", () => {
    for (const body of [upd, ins]) {
      for (const f of JOB_PRICING_FIELDS) {
        expect(body, f).toContain(`${f} = COALESCE(EXCLUDED.${f}, public.job_pricing.${f})`);
      }
    }
  });

  it("store NULL on the job: BEFORE UPDATE sets NEW to NULL, AFTER INSERT blanks the row once", () => {
    for (const f of JOB_PRICING_FIELDS) expect(upd, f).toContain(`NEW.${f} := NULL;`);
    expect(upd).toContain("RETURN NEW;");
    expect(ins).toMatch(/UPDATE public\.jobs SET[\s\S]*WHERE id = NEW\.id;/);
  });

  it("are SECURITY DEFINER with a fixed search path, and not callable by users", () => {
    for (const body of [upd, ins]) {
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path TO 'public'");
    }
    expect(up).toMatch(/REVOKE ALL ON FUNCTION public\.seal_job_pricing_before_update\(\) FROM PUBLIC, anon, authenticated;/);
    expect(up).toMatch(/REVOKE ALL ON FUNCTION public\.seal_job_pricing_after_insert\(\) FROM PUBLIC, anon, authenticated;/);
  });

  it("only fire when a NEW value is non-NULL, which is what stops them re-firing on their own NULLing", () => {
    for (const name of ["trg_seal_job_pricing_ins", "trg_seal_job_pricing_upd"]) {
      const t = between(up, `CREATE TRIGGER ${name}`, "();");
      for (const f of JOB_PRICING_FIELDS) expect(t, `${name} ${f}`).toContain(`NEW.${f} IS NOT NULL`);
      expect(t).not.toContain("IS DISTINCT FROM");
    }
  });

  it("the update trigger is BEFORE and the insert trigger AFTER (the job row must exist for the foreign key)", () => {
    expect(between(up, "CREATE TRIGGER trg_seal_job_pricing_upd", "BEFORE UPDATE OF")).toContain("BEFORE UPDATE OF");
    expect(between(up, "CREATE TRIGGER trg_seal_job_pricing_ins", "AFTER INSERT")).toContain("AFTER INSERT");
  });

  it("replace the phase 1 mirror", () => {
    expect(up).toContain("DROP TRIGGER IF EXISTS trg_mirror_job_pricing_ins ON public.jobs;");
    expect(up).toContain("DROP TRIGGER IF EXISTS trg_mirror_job_pricing_upd ON public.jobs;");
    expect(up).toContain("DROP FUNCTION IF EXISTS public.mirror_job_pricing_from_jobs();");
  });
});

describe("the rollback", () => {
  it("is one transaction", () => {
    expect(down.trim().startsWith("BEGIN;")).toBe(true);
    expect(down.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("drops the seal BEFORE copying values back (or the copy would be blanked again)", () => {
    expect(down.indexOf("DROP TRIGGER IF EXISTS trg_seal_job_pricing_upd")).toBeGreaterThan(-1);
    expect(down.indexOf("DROP TRIGGER IF EXISTS trg_seal_job_pricing_upd")).toBeLessThan(down.indexOf("UPDATE public.jobs j SET"));
  });

  it("copies every field back from job_pricing", () => {
    const copy = between(down, "UPDATE public.jobs j SET", "WHERE p.job_id = j.id;");
    for (const f of JOB_PRICING_FIELDS) expect(copy, f).toContain(`${f} = p.${f}`);
  });

  it("restores the phase 1 mirror exactly as phase 1 defines it", () => {
    const fn = (t: string) => between(t, "CREATE OR REPLACE FUNCTION public.mirror_job_pricing_from_jobs()", "$$;");
    expect(fn(down)).toBe(fn(phase1));
    for (const name of ["trg_mirror_job_pricing_ins", "trg_mirror_job_pricing_upd"]) {
      expect(between(down, `CREATE TRIGGER ${name}`, "();")).toBe(between(phase1, `CREATE TRIGGER ${name}`, "();"));
    }
  });
});

describe("the app clears a price through job_pricing, not the sealed column", () => {
  it("every price writer calls saveJobPricing", () => {
    for (const p of ["src/lib/api.ts", "src/components/JobPriceEditor.tsx", "src/components/PricingSuggestionPanel.tsx"]) {
      expect(read(p), p).toContain("saveJobPricing(");
    }
  });
});
