#!/usr/bin/env node
// Read-only comparison of the PRODUCTION migration ledger with supabase/migrations.
//
//   pending : in Git, not yet applied to production (expected right after a
//             merge, until the release workflow applies it)
//   drift   : applied to production but NOT in Git (someone changed production
//             outside the repository; commit it before anything else)
//
// Exit codes: 0 in sync, 1 pending only, 3 drift, 2 refused/unavailable.
// Connects with default_transaction_read_only=on; never writes.
// Usage: PRODUCTION_READONLY_DB_URL=postgresql://... node scripts/free-tier/production-drift.mjs [--self-test]
import { execFileSync } from "node:child_process";
import { readdirSync, appendFileSync } from "node:fs";

const PROD = "lynkvfduzqdyvlzgriyh";
const STAGING = "mfedxybzajdgavzmajkl";

export function productionTarget(raw) {
  if (!raw || raw.includes(STAGING)) throw Error("missing or prohibited source");
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  const user = decodeURIComponent(u.username);
  if (!["postgres:", "postgresql:"].includes(u.protocol) || u.pathname !== "/postgres" || !u.password) {
    throw Error("unsupported connection settings");
  }
  const direct = host === `db.${PROD}.supabase.co`;
  const pooled = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user.endsWith(`.${PROD}`);
  if (!direct && !pooled) throw Error("source must be the Axentra production project");
  return { host, user, port: u.port || "5432", password: decodeURIComponent(u.password) };
}

export function compare(prodVersions, repoVersions) {
  const prod = new Set(prodVersions), repo = new Set(repoVersions);
  return {
    pending: [...repo].filter((v) => !prod.has(v)).sort(),
    drift: [...prod].filter((v) => !repo.has(v)).sort(),
  };
}

const repoVersions = () =>
  readdirSync("supabase/migrations").filter((f) => /^\d{14}_.+\.sql$/.test(f)).map((f) => f.slice(0, 14));

function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
}

if (process.argv.includes("--self-test")) {
  const ok = `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres`;
  productionTarget(ok);
  for (const bad of [ok.replace(PROD, STAGING), ok.replace(".supabase.co", ".supabase.co.evil.test"), "postgresql://postgres:x@127.0.0.1:5432/postgres"]) {
    let refused = false;
    try { productionTarget(bad); } catch { refused = true; }
    if (!refused) throw Error("unsafe target accepted: " + bad);
  }
  const r = compare(["1", "2"], ["1", "3"]);
  if (r.pending.join() !== "3" || r.drift.join() !== "2") throw Error("compare broken");
  console.log("PASS: production drift check is read-only, production-only and compares both directions");
  process.exit(0);
}

let target;
try {
  target = productionTarget(process.env.PRODUCTION_READONLY_DB_URL);
} catch (e) {
  summary(`### Production drift check: NOT EXECUTED (${e.message}). Add the PRODUCTION_READONLY_DB_URL secret.`);
  process.exit(2);
}
const env = {
  ...process.env, PGHOST: target.host, PGPORT: target.port, PGUSER: target.user, PGDATABASE: "postgres",
  PGPASSWORD: target.password, PGSSLMODE: "require", PGCONNECT_TIMEOUT: "10",
  PGOPTIONS: "-c default_transaction_read_only=on",
};
delete env.PRODUCTION_READONLY_DB_URL;
const out = execFileSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version"],
  { env, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
const { pending, drift } = compare(out.split("\n").map((s) => s.trim()).filter(Boolean), repoVersions());
summary(`### Production migration ledger vs Git`);
summary(`- pending (in Git, not applied): ${pending.length ? pending.join(", ") : "none"}`);
summary(`- drift (applied, not in Git): ${drift.length ? drift.join(", ") : "none"}`);
if (drift.length) { console.error("::error::Production has migrations that are not in Git. Commit them first."); process.exit(3); }
process.exit(pending.length ? 1 : 0);
