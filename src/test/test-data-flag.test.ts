/**
 * The test-data flag (migration 20261121140000): jobs, invoices and expenses carry is_test, new records inherit
 * it from their job, the migration never marks anything, and every report that totals money leaves flagged
 * records out. These tests read the migration, rollback and report code so none of that can drift.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = code(read("supabase/migrations/20261121150000_test_data_flag.sql"));
const down = code(read("supabase/rollback/20261121150000_test_data_flag.down.sql"));

describe("migration", () => {
  it("adds is_test to jobs, invoices and expenses as NOT NULL DEFAULT false", () => {
    for (const t of ["jobs", "invoices", "expenses"]) {
      expect(up).toContain(`ALTER TABLE public.${t}`);
    }
    expect(up.match(/ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;/g)).toHaveLength(3);
  });

  it("only adds columns and triggers: it never marks, deletes or hides anything", () => {
    expect(up).not.toMatch(/\bUPDATE\s+public\./i);
    expect(up).not.toMatch(/\bDELETE\b/i);
    expect(up).not.toMatch(/is_hidden/i);
    expect(up).not.toMatch(/interval/i);
  });

  it("makes expenses and invoices inherit the flag from their job on insert", () => {
    expect(up).toMatch(/CREATE TRIGGER trg_expenses_inherit_is_test\s+BEFORE INSERT ON public\.expenses/);
    expect(up).toMatch(/CREATE TRIGGER trg_invoices_inherit_is_test\s+BEFORE INSERT ON public\.invoices/);
    expect(up).toContain("SECURITY DEFINER");
    expect(up).toContain("SET search_path TO 'public'");
    expect(up).toMatch(/REVOKE ALL ON FUNCTION public\.inherit_is_test_from_job\(\) FROM PUBLIC, anon, authenticated;/);
    // an explicit flag is kept; only an unflagged row looks at the job
    expect(up).toContain("IF NEW.job_id IS NOT NULL AND NOT NEW.is_test THEN");
  });
});

describe("rollback", () => {
  it("is one transaction that removes the triggers, the function and the three columns", () => {
    expect(down.trim().startsWith("BEGIN;")).toBe(true);
    expect(down.trim().endsWith("COMMIT;")).toBe(true);
    for (const t of ["trg_expenses_inherit_is_test", "trg_invoices_inherit_is_test"]) expect(down).toContain(`DROP TRIGGER IF EXISTS ${t}`);
    expect(down).toContain("DROP FUNCTION IF EXISTS public.inherit_is_test_from_job();");
    for (const t of ["jobs", "invoices", "expenses"]) expect(down).toContain(`ALTER TABLE public.${t}`);
    expect(down.match(/DROP COLUMN IF EXISTS is_test;/g)).toHaveLength(3);
    // dropping the columns must come after the triggers that use them
    expect(down.indexOf("DROP TRIGGER")).toBeLessThan(down.indexOf("DROP COLUMN"));
  });
});

describe("reports leave test data out", () => {
  const filtered: Array<[string, string, number]> = [
    ["src/features/accounts/api/accountsData.ts", '.eq("is_test", false)', 2], // invoices + expenses
    ["src/features/control/hooks/useControlProfitabilityData.ts", '.eq("is_test", false)', 1],
    ["src/features/invoicing/hooks/useInvoicePrepData.ts", '.eq("is_test", false)', 2], // completed + aborted jobs
    ["src/features/attention/hooks/useAttentionData.ts", '.eq("is_test", false)', 1],
    ["src/hooks/useAdminOperationsBuckets.ts", '.eq("is_test", false)', 2],
  ];
  for (const [file, needle, count] of filtered) {
    it(`${file} filters out is_test records`, () => {
      expect(read(file).split(needle).length - 1).toBe(count);
    });
  }

  it("the weekly-numbers query skips test jobs, invoices and expenses", () => {
    const sql = read(".claude/skills/axentra-weekly-numbers/weekly.sql");
    expect(sql).toContain("not j.is_test");
    expect(sql).toContain("document_type = 'invoice' and not is_test");
    expect(sql).toContain("not e.is_hidden and not e.is_test");
  });

  it("the generated types and Job type know the flag", () => {
    const types = read("src/integrations/supabase/types.ts");
    for (const t of ["jobs", "invoices", "expenses"]) {
      const a = types.indexOf(`      ${t}: {\n        Row: {`);
      const b = types.indexOf("Relationships", a);
      expect(types.slice(a, b), t).toContain("is_test: boolean");
    }
    expect(read("src/lib/types.ts")).toContain("is_test?: boolean;");
  });
});

describe("test data is silenced everywhere (migration 20261121180000)", () => {
  const up = code(read("supabase/migrations/20261121180000_silence_test_data.sql"));
  const down = code(read("supabase/rollback/20261121180000_silence_test_data.down.sql"));

  it("hides is_test rows from every app user with RESTRICTIVE select policies", () => {
    for (const t of ["jobs", "invoices", "expenses"]) {
      expect(up).toMatch(new RegExp(`CREATE POLICY ${t}_hide_test_data ON public\\.${t}\\s+AS RESTRICTIVE FOR SELECT TO anon, authenticated\\s+USING \\(is_test = false\\);`));
    }
  });

  it("never updates, deletes or re-flags data", () => {
    expect(up).not.toMatch(/\bUPDATE\s+public\./i);
    expect(up).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(up).not.toMatch(/SET\s+is_test/i);
  });

  it("filters test data in every customer-facing SECURITY DEFINER function (they bypass RLS)", () => {
    for (const fn of ["portal_list_jobs", "portal_get_job", "portal_list_invoices", "portal_get_invoice", "portal_can_read_invoice_pdf", "qr_lookup"]) {
      const start = up.indexOf(`FUNCTION public.${fn}(`);
      expect(start, fn).toBeGreaterThan(-1);
      const body = up.slice(start, up.indexOf("$function$;", start));
      expect(body, fn).toMatch(/is_test/);
    }
  });

  it("rollback drops the policies and restores the functions without the filter", () => {
    expect(down.trim().startsWith("BEGIN;")).toBe(true);
    expect(down.trim().endsWith("COMMIT;")).toBe(true);
    for (const t of ["jobs", "invoices", "expenses"]) expect(down).toContain(`DROP POLICY IF EXISTS ${t}_hide_test_data ON public.${t};`);
    expect(down.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(6);
    expect(down).not.toMatch(/is_test/);
  });

  it("customer emails skip test jobs; the portal job count excludes them", () => {
    expect(read("supabase/functions/_shared/customerStatusEmail.ts")).toContain('return "job_test"');
    expect(read("supabase/functions/notify-customers/index.ts")).toContain("is_hidden, is_test,");
    expect(read("supabase/functions/portal-access/index.ts")).toContain('.eq("is_test", false)');
  });
});
