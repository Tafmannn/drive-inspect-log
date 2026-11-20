/**
 * POD files in storage follow the "View PODs" permission (migration 20261120140000).
 * These tests read the migration, its rollback and the app code that talks to the buckets,
 * so the rules can't be loosened by accident and the app keeps working under them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const sql = read("supabase/migrations/20261120140000_pod_storage_follow_permissions.sql");
const down = read("supabase/rollback/20261120140000_pod_storage_follow_permissions.down.sql");

const BUCKETS = ["pod-pdfs", "pod-photos"] as const;
const OPS = ["select", "insert", "update", "delete"] as const;
const prefix = (b: string) => b.replace("-", "_");

/** One CREATE POLICY statement by name: from its start to its own closing semicolon. */
function policy(text: string, name: string): string {
  const start = text.indexOf(`CREATE POLICY ${name} `);
  expect(start, `policy ${name} exists`).toBeGreaterThan(-1);
  const end = text.indexOf(";", start);
  return text.slice(start, end + 1);
}

describe("the new policies", () => {
  it("replace all four rules on both buckets", () => {
    for (const b of BUCKETS) {
      for (const op of OPS) {
        const name = `${prefix(b)}_${op}_org`;
        expect(sql).toContain(`DROP POLICY IF EXISTS ${name} ON storage.objects;`);
        expect(sql).toContain(`CREATE POLICY ${name} ON storage.objects FOR ${op.toUpperCase()} TO authenticated`);
      }
    }
  });

  it("only touch the POD buckets", () => {
    const buckets = [...sql.matchAll(/bucket_id = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(new Set(buckets)).toEqual(new Set(BUCKETS));
  });

  it("read and write need an admin or the View PODs permission; delete needs an admin or Manage PODs", () => {
    for (const b of BUCKETS) {
      for (const op of ["select", "insert", "update"] as const) {
        const p = policy(sql, `${prefix(b)}_${op}_org`);
        const views = p.split("public.user_has_permission(auth.uid(), 'pod.view')").length - 1;
        // an update rule has two halves (the old row and the new row); each must say View PODs
        expect(views, `${prefix(b)}_${op}_org`).toBe(op === "update" ? 2 : 1);
        expect(p).not.toContain("'pod.manage'");
      }
      const del = policy(sql, `${prefix(b)}_delete_org`);
      expect(del.split("public.user_has_permission(auth.uid(), 'pod.manage')").length - 1).toBe(1);
      expect(del).not.toContain("'pod.view'");
    }
  });

  it("every rule still requires the file to be in the caller's own organisation folder", () => {
    for (const b of BUCKETS) {
      for (const op of OPS) {
        const p = policy(sql, `${prefix(b)}_${op}_org`);
        expect(p).toContain("split_part(name, '/', 1) = (public.user_org_id())::text");
        expect(p).toContain("public.is_admin_or_super_admin()");
        expect(p).toContain("public.is_super_admin()"); // the owner keeps access
      }
    }
  });

  it("an update rule checks both the old and the new row", () => {
    for (const b of BUCKETS) {
      const p = policy(sql, `${prefix(b)}_update_org`);
      expect(p).toContain("USING (");
      expect(p).toContain("WITH CHECK (");
    }
  });

  it("no longer lets just any member of the organisation in", () => {
    for (const b of BUCKETS) {
      for (const op of OPS) {
        const p = policy(sql, `${prefix(b)}_${op}_org`);
        // the org-folder check is never the whole story: it is always combined with a role or permission
        expect(p).toMatch(/is_admin_or_super_admin\(\) OR public\.user_has_permission/);
      }
    }
  });
});

describe("the rollback", () => {
  it("restores the old rule (anyone in the organisation) for every policy, in one transaction", () => {
    expect(down).toMatch(/^BEGIN;/m);
    expect(down).toMatch(/COMMIT;\s*$/);
    for (const b of BUCKETS) {
      for (const op of OPS) {
        const p = policy(down, `${prefix(b)}_${op}_org`);
        expect(p).toContain("split_part(name, '/', 1) = (public.user_org_id())::text");
        expect(p).not.toContain("user_has_permission");
        expect(p).not.toContain("is_admin_or_super_admin");
      }
    }
  });
});

describe("the app keeps working under these rules", () => {
  const podPdf = read("src/lib/podPdf.ts");

  it("uploads a POD with 'overwrite if it exists', which needs the insert AND update rules (both allow View PODs)", () => {
    const uploads = [...podPdf.matchAll(/\.upload\(path, [a-zA-Z]+, \{[^}]*\}/g)].map((m) => m[0]);
    expect(uploads.length).toBeGreaterThanOrEqual(2);
    for (const u of uploads) expect(u).toContain("upsert: true");
    for (const b of BUCKETS) {
      expect(policy(sql, `${prefix(b)}_insert_org`)).toContain("'pod.view'");
      expect(policy(sql, `${prefix(b)}_update_org`)).toContain("'pod.view'");
    }
  });

  it("files live under the organisation's folder, which is what the rules check", () => {
    expect(podPdf).toMatch(/const path = `\$\{orgId\}\/AXENTRA_POD_/);
    expect(podPdf).toMatch(/const path = `\$\{orgId\}\/\$\{fileName\}`/);
  });

  it("never deletes a POD file, so a driver's Manage PODs permission is not needed", () => {
    expect(podPdf).not.toMatch(/\.remove\(/);
  });

  it("reads POD files through signed links, which needs the select rule (View PODs)", () => {
    expect(podPdf).toContain("createSignedUrl");
    for (const b of BUCKETS) expect(policy(sql, `${prefix(b)}_select_org`)).toContain("'pod.view'");
  });
});
