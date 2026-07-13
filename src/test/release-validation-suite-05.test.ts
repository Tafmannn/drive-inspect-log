/**
 * Suite 05 (RLS / security-posture static analysis) resolves the qr_confirmations
 * and vehicle-photos exposure checks by replaying CREATE/DROP policy lifecycle
 * across the migration history in chronological order. This regression-tests
 * that replay logic directly against synthetic migration fixtures — proving
 * both that a closed exposure reads as resolved (the real-repo case, formerly
 * a false-positive WARNING) and that a later regression which reintroduces the
 * same permissive policy is still caught.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { policyExposureStillActive } from "../../release-validation/suites/05-rls-policy-static.mjs";

let dir: string;

function write(name: string, sql: string) {
  writeFileSync(join(dir, name), sql, "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "suite05-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const QR_OPTS = {
  createPattern: /CREATE\s+POLICY\s+"Allow all for anon on qr_confirmations"/i,
  dropPattern: /DROP\s+POLICY\s+IF\s+EXISTS\s+"Allow all for anon on qr_confirmations"/i,
};

describe("policyExposureStillActive", () => {
  it("flags an exposure that was created and never dropped", () => {
    write(
      "20260101000000_init.sql",
      `CREATE POLICY "Allow all for anon on qr_confirmations" ON public.qr_confirmations FOR ALL USING (true);`,
    );
    const files = ["20260101000000_init.sql"];
    const result = policyExposureStillActive(dir, files, QR_OPTS);
    expect(result.active).toBe(true);
    expect(result.closedBy).toBeNull();
  });

  it("resolves to closed when a later migration drops the exposure (the real-repo case)", () => {
    write(
      "20260101000000_init.sql",
      `CREATE POLICY "Allow all for anon on qr_confirmations" ON public.qr_confirmations FOR ALL USING (true);`,
    );
    write(
      "20260201000000_close.sql",
      `DROP POLICY IF EXISTS "Allow all for anon on qr_confirmations" ON public.qr_confirmations;`,
    );
    const files = ["20260101000000_init.sql", "20260201000000_close.sql"].sort();
    const result = policyExposureStillActive(dir, files, QR_OPTS);
    expect(result.active).toBe(false);
    expect(result.closedBy).toBe("20260201000000_close.sql");
  });

  it("re-flags a regression that reintroduces the exposure after it was closed", () => {
    write(
      "20260101000000_init.sql",
      `CREATE POLICY "Allow all for anon on qr_confirmations" ON public.qr_confirmations FOR ALL USING (true);`,
    );
    write(
      "20260201000000_close.sql",
      `DROP POLICY IF EXISTS "Allow all for anon on qr_confirmations" ON public.qr_confirmations;`,
    );
    write(
      "20260301000000_regression.sql",
      `CREATE POLICY "Allow all for anon on qr_confirmations" ON public.qr_confirmations FOR ALL USING (true);`,
    );
    const files = [
      "20260101000000_init.sql",
      "20260201000000_close.sql",
      "20260301000000_regression.sql",
    ].sort();
    const result = policyExposureStillActive(dir, files, QR_OPTS);
    expect(result.active).toBe(true);
    expect(result.closedBy).toBeNull();
  });

  it("stays closed when the DROP is a later timestamp than the CREATE, regardless of file listing order", () => {
    write(
      "20260301000000_close.sql",
      `DROP POLICY IF EXISTS "Allow all for anon on qr_confirmations" ON public.qr_confirmations;`,
    );
    write(
      "20260101000000_init.sql",
      `CREATE POLICY "Allow all for anon on qr_confirmations" ON public.qr_confirmations FOR ALL USING (true);`,
    );
    // Sorted lexically, exactly as suite 02 requires and the real suite does.
    const files = ["20260101000000_init.sql", "20260301000000_close.sql"];
    const result = policyExposureStillActive(dir, files, QR_OPTS);
    expect(result.active).toBe(false);
  });

  it("reports no exposure at all when the create pattern never matches", () => {
    write("20260101000000_init.sql", `CREATE TABLE public.qr_confirmations (id uuid);`);
    const files = ["20260101000000_init.sql"];
    const result = policyExposureStillActive(dir, files, QR_OPTS);
    expect(result.active).toBe(false);
    expect(result.closedBy).toBeNull();
  });
});

/**
 * Shared "flags as active, then resolves once dropped" pair, parameterized
 * per policy — SECURITY-001/003/004 all fixed the identical mistake (a
 * permissive policy created and never dropped) on a different table, so
 * the four security batches this batch covers exercised it with four
 * hand-written, near-duplicate test blocks. This shared helper generates
 * that pair once; call sites below supply only what differs per policy.
 */
function testAdminOnlyWritesExposureLifecycle(opts: {
  table: string;
  policyName: string;
  initSql: string;
  initFile?: string;
  closeFile?: string;
}) {
  const initFile = opts.initFile ?? "20260101000000_init.sql";
  const closeFile = opts.closeFile ?? "20260713000000_close.sql";
  const patternOpts = {
    createPattern: new RegExp(`CREATE\\s+POLICY\\s+"${opts.policyName}"`, "i"),
    dropPattern: new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${opts.policyName}"`, "i"),
  };

  it(`flags the original permissive ${opts.table} policy as active before the fix`, () => {
    write(initFile, opts.initSql);
    const result = policyExposureStillActive(dir, [initFile], patternOpts);
    expect(result.active).toBe(true);
  });

  it(`resolves ${opts.table} to closed once the admin-only migration drops it (the real-repo case)`, () => {
    write(initFile, opts.initSql);
    write(closeFile, `DROP POLICY IF EXISTS "${opts.policyName}" ON public.${opts.table};`);
    const result = policyExposureStillActive(dir, [initFile, closeFile], patternOpts);
    expect(result.active).toBe(false);
    expect(result.closedBy).toBe(closeFile);
  });
}

// SECURITY-001: driver_onboarding's "Org members can manage onboarding" FOR
// ALL policy let any org member (not just admins) write onboarding review
// decisions.
describe("policyExposureStillActive — driver_onboarding writes (SECURITY-001)", () => {
  testAdminOnlyWritesExposureLifecycle({
    table: "driver_onboarding",
    policyName: "Org members can manage onboarding",
    initSql: `CREATE POLICY "Org members can manage onboarding" ON public.driver_onboarding FOR ALL USING (is_super_admin() OR org_id = user_org_id());`,
    initFile: "20260317100818_init.sql",
    closeFile: "20260713190000_close.sql",
  });
});

// SECURITY-003: clients/invoice_items had the same "Org members can manage
// X" FOR ALL shape as driver_onboarding, even though every real write path
// is admin-only in practice.
describe("policyExposureStillActive — clients/invoice_items writes (SECURITY-003)", () => {
  testAdminOnlyWritesExposureLifecycle({
    table: "clients",
    policyName: "Org members can manage clients",
    initSql: `CREATE POLICY "Org members can manage clients" ON public.clients FOR ALL USING (is_super_admin() OR org_id = user_org_id());`,
    initFile: "20260323222553_init.sql",
    closeFile: "20260713200000_close.sql",
  });

  testAdminOnlyWritesExposureLifecycle({
    table: "invoice_items",
    policyName: "Org members can manage invoice_items",
    initSql: `CREATE POLICY "Org members can manage invoice_items" ON public.invoice_items FOR ALL USING (true);`,
    initFile: "20260323222553_init.sql",
    closeFile: "20260713200000_close.sql",
  });
});

// SECURITY-004: client_logs' original USING(true) SELECT policy (no role
// restriction at all) was never dropped when a narrower org-scoped policy
// was added alongside it — RLS OR's permissive policies together, so the
// anon-readable exposure stayed fully active regardless of the later,
// narrower policy layered on top.
describe("policyExposureStillActive — client_logs anon-read (SECURITY-004)", () => {
  testAdminOnlyWritesExposureLifecycle({
    table: "client_logs",
    policyName: "Allow select for anon on client_logs",
    initSql: `CREATE POLICY "Allow select for anon on client_logs" ON public.client_logs FOR SELECT USING (true);`,
    initFile: "20260301095617_init.sql",
    closeFile: "20260713210000_close.sql",
  });

  it("stays active even after a later, narrower policy is added alongside it (RLS ORs policies together)", () => {
    const opts = {
      createPattern: /CREATE\s+POLICY\s+"Allow select for anon on client_logs"/i,
      dropPattern: /DROP\s+POLICY\s+IF\s+EXISTS\s+"Allow select for anon on client_logs"/i,
    };
    write(
      "20260301095617_init.sql",
      `CREATE POLICY "Allow select for anon on client_logs" ON public.client_logs FOR SELECT USING (true);`,
    );
    write(
      "20260316204833_narrower.sql",
      `CREATE POLICY "Org admins can read own org client_logs" ON public.client_logs FOR SELECT TO authenticated USING ((context->>'org_id')::uuid = user_org_id());`,
    );
    const files = ["20260301095617_init.sql", "20260316204833_narrower.sql"];
    const result = policyExposureStillActive(dir, files, opts);
    expect(result.active).toBe(true);
  });
});
