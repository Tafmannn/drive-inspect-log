/**
 * Drivers lose "View PODs" by default (migration 20261120150000): only the one template row
 * changes, and the rollback puts exactly that row back.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = strip(read("supabase/migrations/20261120150000_driver_pod_view_default_off.sql"));
const down = strip(read("supabase/rollback/20261120150000_driver_pod_view_default_off.down.sql"));

describe("driver default for View PODs", () => {
  it("switches off exactly one thing: the driver role's pod.view", () => {
    const statements = up.split(";").map((s) => s.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    const s = statements[0].replace(/\s+/g, " ");
    expect(s).toContain("UPDATE public.role_permission_templates SET is_allowed = false");
    expect(s).toContain("role = 'driver'");
    expect(s).toContain("permission_key = 'pod.view'");
  });

  it("never touches admins, the super admin, other permissions, or per-person overrides", () => {
    expect(up).not.toMatch(/'admin'|'super_admin'|pod\.manage/);
    expect(up).not.toMatch(/user_permission_overrides/);
    expect(up).not.toMatch(/DELETE|DROP|TRUNCATE|INSERT/i);
  });

  it("the rollback puts back exactly that one row, in a transaction", () => {
    expect(down).toMatch(/^\s*BEGIN;/);
    expect(down).toMatch(/COMMIT;\s*$/);
    const s = down.replace(/\s+/g, " ");
    expect(s).toContain("UPDATE public.role_permission_templates SET is_allowed = true");
    expect(s).toContain("role = 'driver'");
    expect(s).toContain("permission_key = 'pod.view'");
    expect(down).not.toMatch(/'admin'|'super_admin'|pod\.manage|user_permission_overrides/);
  });

  it("the screens still ask the database for the permission, so the change reaches them", () => {
    const hook = read("src/hooks/useCanViewPod.ts");
    expect(hook).toContain('"user_has_permission"');
    expect(hook).toContain('p_permission_key: "pod.view"');
    expect(hook).toMatch(/if \(privileged\) return true;\s*return data === true;/); // fails closed for a driver
  });
});
