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

// SECURITY-001: driver_onboarding's "Org members can manage onboarding" FOR
// ALL policy let any org member (not just admins) write onboarding review
// decisions. Guards the exact string this repo's migrations use, so a future
// typo in the DROP statement's policy name can't silently leave the check
// permanently green while the real exposure stays open.
const ONBOARDING_WRITES_OPTS = {
  createPattern: /CREATE\s+POLICY\s+"Org members can manage onboarding"/i,
  dropPattern: /DROP\s+POLICY\s+IF\s+EXISTS\s+"Org members can manage onboarding"/i,
};

describe("policyExposureStillActive — driver_onboarding writes (SECURITY-001)", () => {
  it("flags the original permissive FOR ALL policy as active before the fix", () => {
    write(
      "20260317100818_init.sql",
      `CREATE POLICY "Org members can manage onboarding" ON public.driver_onboarding FOR ALL USING (is_super_admin() OR org_id = user_org_id());`,
    );
    const files = ["20260317100818_init.sql"];
    const result = policyExposureStillActive(dir, files, ONBOARDING_WRITES_OPTS);
    expect(result.active).toBe(true);
  });

  it("resolves to closed once the admin-only migration drops it (the real-repo case)", () => {
    write(
      "20260317100818_init.sql",
      `CREATE POLICY "Org members can manage onboarding" ON public.driver_onboarding FOR ALL USING (is_super_admin() OR org_id = user_org_id());`,
    );
    write(
      "20260713190000_close.sql",
      `DROP POLICY IF EXISTS "Org members can manage onboarding" ON public.driver_onboarding;`,
    );
    const files = ["20260317100818_init.sql", "20260713190000_close.sql"];
    const result = policyExposureStillActive(dir, files, ONBOARDING_WRITES_OPTS);
    expect(result.active).toBe(false);
    expect(result.closedBy).toBe("20260713190000_close.sql");
  });
});
