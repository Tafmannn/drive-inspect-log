import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// scripts/sync-staging-migrations.sh must understand staging's rebuilt history
// (original version kept as the name prefix) and must never run on production.
function run(url: string, applied: string[], args: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "psql-stub-"));
  const stub = join(dir, "psql");
  writeFileSync(stub, `#!/usr/bin/env bash\nif [[ "$*" == *"-Atc"* ]]; then printf '%s\\n' ${applied.join(" ")}; else cat >/dev/null; fi\n`);
  chmodSync(stub, 0o755);
  try {
    return { code: 0, out: execFileSync("bash", ["scripts/sync-staging-migrations.sh", ...args], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STAGING_DB_URL: url }, encoding: "utf8",
    }) };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: err.stdout + err.stderr };
  }
}

describe("sync-staging-migrations.sh", () => {
  it("refuses the production project", () => {
    const r = run("postgres://u@db.lynkvfduzqdyvlzgriyh.supabase.co/postgres", []);
    expect(r.code).toBe(2);
    expect(r.out).toContain("REFUSING");
  });

  it("treats name-prefixed versions as applied and dry-runs by default", () => {
    const r = run("postgres://u@db.staging/postgres", ["20260225231715", "20261121160000"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("20260225231715_");
    expect(r.out).not.toContain("20261121160000_");
    expect(r.out).toContain("20261121150000_test_data_flag.sql");
    expect(r.out).toContain("Dry run only");
  });
  it("does not replay the two custom-name catalogue migrations already installed on staging", () => {
    const r = run("postgres://u@db.staging/postgres", [
      "name:vehicle_catalogue_images",
      "name:job_catalogue_image_matching",
    ]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("20261121170000_vehicle_catalogue_images.sql");
    expect(r.out).not.toContain("20261121170100_job_catalogue_image_matching.sql");
    expect(r.out).toContain("20261123100000_job_abort_workflow.sql");
  });

  it("has unambiguous migration slugs for safe staging name matching", () => {
    const slugs = readdirSync("supabase/migrations")
      .filter((f) => /^\d{14}_.+\.sql$/.test(f))
      .map((f) => f.slice(15, -4));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("refuses DDL when the URL is not explicitly the known staging project", () => {
    const r = run("postgres://u@db.staging/postgres", [], ["--apply"]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("REFUSING");
    expect(r.out).toContain("staging ref");
  });

  it("refuses DDL against staging until a restorable backup is verified", () => {
    const r = run("postgres://u@db.mfedxybzajdgavzmajkl.supabase.co/postgres", [], ["--apply"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("STAGING_BACKUP_VERIFIED=YES");
  });

});
