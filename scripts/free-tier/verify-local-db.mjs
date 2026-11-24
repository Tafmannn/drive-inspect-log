#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const migrations = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
const versions = migrations.map(f => {
  assert.match(f, /^\d{14}_.+\.sql$/, "Invalid migration name: " + f);
  return f.slice(0,14);
});
assert.equal(new Set(versions).size, versions.length, "Duplicate migration versions");
assert.ok(migrations.length >= 120, "Expected at least 120 Axentra migrations");
const digital = migrations.some(f => f.endsWith("_digital_id_v2.sql"));
assert.ok(migrations.some(f => f.endsWith("_job_abort_workflow.sql")));
assert.ok(migrations.some(f => f.endsWith("_abort_client_confirmed_fee_corrections.sql")));
if (digital) assert.ok(readdirSync("supabase/tests").includes("digital_id_v2.integration.sql"),
  "Digital ID migration requires a real rollback-only SQL scenario");
if (process.argv.includes("--static")) {
  console.log("PASS: "+migrations.length+" migrations inventoried; Digital ID included="+digital);
  process.exit(0);
}
assert.equal(process.env.AXENTRA_DISPOSABLE_DB,"YES");
assert.equal(process.env.PGHOST,"127.0.0.1");
assert.equal(process.env.PGPORT,"54322");
assert.equal(process.env.PGUSER,"postgres");
assert.equal(process.env.PGDATABASE,"postgres");
const env = { ...process.env,PGPASSWORD:"postgres",PGSSLMODE:"disable" };
function sql(stmt) {
  return execFileSync("psql",["-X","-A","-t","-v","ON_ERROR_STOP=1","-c",stmt],{
    encoding:"utf8",env,timeout:30000,maxBuffer:1024*1024}).trim();
}
const applied = JSON.parse(sql("SELECT coalesce(json_agg(version ORDER BY version),'[]'::json)::text FROM supabase_migrations.schema_migrations"));
const missing = versions.filter(x => !new Set(applied).has(x));
assert.deepEqual(missing,[],"Local migration history incomplete");
const state = JSON.parse(sql(
"SELECT json_build_object("+
"'abort',to_regclass('public.job_aborts') IS NOT NULL,"+
"'abort_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.job_aborts')),false),"+
"'invoice',to_regclass('public.invoices') IS NOT NULL,"+
"'digital',to_regclass('public.driver_digital_credentials') IS NOT NULL,"+
"'digital_events',to_regclass('public.driver_digital_credential_events') IS NOT NULL,"+
"'digital_rpc',to_regprocedure('public.get_driver_digital_id(uuid)') IS NOT NULL,"+
"'digital_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.driver_digital_credentials')),false)"+
")::text"));
assert.equal(state.abort,true,"Abort table missing");
assert.equal(state.abort_rls,true,"Abort RLS disabled");
assert.equal(state.invoice,true,"Invoice table missing");
assert.equal(state.digital,digital,"Digital ID schema/migration mismatch");
if(digital) {
  assert.equal(state.digital_events,true,"Digital ID audit trail absent");
  assert.equal(state.digital_rpc,true,"Digital ID RPC absent");
  assert.equal(state.digital_rls,true,"Digital ID RLS disabled");
}
console.log(JSON.stringify({status:"PASS",disposable:true,migrationsExpected:versions.length,
  migrationsApplied:applied.length,digitalTestRequired:digital,checks:state},null,2));
