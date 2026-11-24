#!/usr/bin/env node
/**
 * Read-only staging inventory. Does not apply migrations or connect to production.
 * Modes: --self-test, --inventory, --remote.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STAGING = "mfedxybzajdgavzmajkl";
const PRODUCTION = "lynkvfduzqdyvlzgriyh";
const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function parseStagingConnection(value) {
  if (!value || value.includes(PRODUCTION)) throw new Error("Missing or production database URL");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database URL scheme");
  if (url.pathname !== "/postgres" || url.hash) throw new Error("Invalid database name or fragment");
  if (!url.password) throw new Error("Missing database password");
  const username = decodeURIComponent(url.username);
  const hostname = url.hostname.toLowerCase();
  const port = url.port || "5432";
  const direct = hostname === `db.${STAGING}.supabase.co` && username === "postgres" && port === "5432";
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname) &&
    username === `postgres.${STAGING}` && port === "5432";
  if (!direct && !pooler) throw new Error("Database endpoint not on the exact staging allowlist");
  if ([...url.searchParams].some(([k, v]) => k !== "sslmode" ||
    !["require", "verify-ca", "verify-full"].includes(v))) {
    throw new Error("Unexpected connection options");
  }
  return { host: hostname, user: username, port, password: decodeURIComponent(url.password) };
}

function files() {
  return readdirSync(MIGRATIONS).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
}

function missingMigrations(localFiles, history) {
  const versions = new Set();
  for (const item of history) {
    const prefix = (item.name || "").match(/^(\d{14})_/);
    versions.add(prefix ? prefix[1] : item.version);
    if (!prefix && item.name) versions.add("name:" + item.name);
  }
  return localFiles.filter(name => !versions.has(name.slice(0, 14)) &&
    !versions.has("name:" + name.slice(15, -4)));
}

function inventory() {
  const all = files();
  return {
    localMigrationCount: all.length,
    lastMigration: all.at(-1) || null,
    includesAbort: all.some(x => x.includes("abort_client_confirmed_fee_corrections")),
    includesDigitalId: all.some(x => x.includes("digital_id_v2")),
    mode: "LOCAL_FILES_ONLY",
    remoteVerified: false,
  };
}

if (process.argv.includes("--self-test")) {
  const good = `postgresql://postgres.${STAGING}:dummy@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;
  assert.equal(parseStagingConnection(good).user, `postgres.${STAGING}`);
  const direct = `postgresql://postgres:dummy@db.${STAGING}.supabase.co:5432/postgres`;
  assert.equal(parseStagingConnection(direct).host, `db.${STAGING}.supabase.co`);
  for (const bad of [
    "", good.replace(STAGING, PRODUCTION),
    good.replace("pooler.supabase.com", "pooler.supabase.com.attacker.test"),
    good.replace(`postgres.${STAGING}`, "postgres"),
    good.replace("/postgres?", "/other?"),
    good.replace("?sslmode=require", "?host=attacker"),
    good.replace(":5432/postgres", ":6543/postgres"),
  ]) assert.throws(() => parseStagingConnection(bad));
  const samples = ["20261101000000_one.sql", "20261102000000_two.sql", "20261103000000_three.sql"];
  assert.deepEqual(missingMigrations(samples, [
    { version: "20261101000000", name: "one" },
    { version: "20261109000000", name: "20261102000000_two" },
  ]), [samples[2]]);
  console.log("PASS: strict staging target guard, aliases, migration inventory helpers");
  process.exit(0);
}

if (process.argv.includes("--inventory")) {
  console.log(JSON.stringify(inventory(), null, 2));
  process.exit(0);
}

if (!process.argv.includes("--remote")) {
  console.error("Choose --self-test, --inventory, or --remote");
  process.exit(2);
}

try {
  const db = parseStagingConnection(process.env.STAGING_DB_URL);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
    !k.startsWith("PG") && k !== "STAGING_DB_URL"));
  Object.assign(env, {
    PGHOST: db.host, PGPORT: db.port, PGUSER: db.user, PGPASSWORD: db.password,
    PGDATABASE: "postgres", PGSSLMODE: "require", PGCONNECT_TIMEOUT: "10",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=30000",
  });
  const query = `SELECT json_build_object(
    'read_only', current_setting('transaction_read_only'),
    'history', (SELECT coalesce(json_agg(json_build_object('version', version, 'name', name) ORDER BY version), '[]'::json)
                FROM supabase_migrations.schema_migrations),
    'public_columns', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),
    'rls_policies', (SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage')),
    'public_functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
    'abort_table', to_regclass('public.job_aborts') IS NOT NULL,
    'digital_id_table', to_regclass('public.driver_digital_credentials') IS NOT NULL
  )::text`;
  const run = spawnSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8", env, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) throw new Error("Read-only staging metadata query failed");
  const result = JSON.parse(run.stdout.trim());
  if (result.read_only !== "on") throw new Error("Staging session was not read-only");
  const missing = missingMigrations(files(), result.history);
  const report = {
    environment: "axentra-staging",
    projectRef: STAGING,
    historyEntries: result.history.length,
    repoMigrations: files().length,
    missingByHistory: missing,
    missingCount: missing.length,
    publicColumns: result.public_columns,
    policyCount: result.rls_policies,
    publicFunctions: result.public_functions,
    abortTable: result.abort_table,
    digitalIdTable: result.digital_id_table,
    readOnly: true,
    backupRestoreVerified: false,
    readyToApply: false,
    status: missing.length || !result.abort_table ? "BLOCKED_SCHEMA_PARITY" : "REVIEW_REQUIRED",
  };
  console.log(JSON.stringify(report, null, 2));
  // Explicitly fail: migration counts alone cannot certify schema parity.
  process.exitCode = 2;
} catch (error) {
  console.error("BLOCKED: safe staging inventory unavailable (" +
    (error instanceof Error ? error.message : "unknown error") + ")");
  process.exitCode = 2;
}
