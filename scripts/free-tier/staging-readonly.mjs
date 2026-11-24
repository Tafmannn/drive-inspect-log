#!/usr/bin/env node
// Staging metadata-only preflight with a strict project/host/user allowlist.
// No mutation, production connectivity, customer row export, or password logging.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const STAGING = "mfedxybzajdgavzmajkl";
const PRODUCTION = "lynkvfduzqdyvlzgriyh";

function parseTarget(raw) {
  if (!raw || raw.includes(PRODUCTION)) throw Error("Missing or prohibited DB URL");
  let url;
  try { url = new URL(raw); } catch { throw Error("Invalid URL"); }
  const host = url.hostname.toLowerCase();
  const user = decodeURIComponent(url.username);
  const options = [...url.searchParams];
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" ||
      url.hash || !url.password || options.some(([k,v]) => k !== "sslmode" || !["require","verify-full","verify-ca"].includes(v))) {
    throw Error("Unsupported connection settings");
  }
  const direct = host === "db." + STAGING + ".supabase.co" &&
    user === "postgres" && (!url.port || url.port === "5432");
  const pool = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) &&
    user === "postgres." + STAGING && ["","5432","6543"].includes(url.port);
  if (!direct && !pool) throw Error("Non-staging database target");
  return { host, user, port:url.port || "5432", password:decodeURIComponent(url.password) };
}
if (process.argv.includes("--self-test")) {
  const direct="postgresql://postgres:synthetic@db."+STAGING+".supabase.co:5432/postgres?sslmode=require";
  const pool="postgresql://postgres."+STAGING+":synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";
  assert.equal(parseTarget(direct).user,"postgres");
  assert.equal(parseTarget(pool).port,"6543");
  for (const bad of ["",direct.replace(STAGING,PRODUCTION),
    direct.replace(".supabase.co",".supabase.co.evil.test"),
    direct.replace("postgres:synthetic","other:synthetic"),
    direct.replace("/postgres","/wrongdb"),direct+"&host=evil.test",
    "postgresql://postgres:synthetic@127.0.0.1:54322/postgres"]) {
    assert.throws(()=>parseTarget(bad));
  }
  console.log("PASS: no production/staging-target confusion");
  process.exit(0);
}
try {
  const target = parseTarget(process.env.STAGING_DB_URL);
  const env = {...process.env,PGHOST:target.host,PGPORT:target.port,PGUSER:target.user,
    PGDATABASE:"postgres",PGPASSWORD:target.password,PGSSLMODE:"require",
    PGCONNECT_TIMEOUT:"10",PGOPTIONS:"-c default_transaction_read_only=on -c statement_timeout=30000"};
  delete env.STAGING_DB_URL;
  const query = "SELECT json_build_object("+
    "'history',(SELECT coalesce(json_agg(json_build_object('version',version,'name',name)),'[]'::json) FROM supabase_migrations.schema_migrations),"+
    "'columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),"+
    "'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),"+
    "'policies',(SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage')),"+
    "'abort',to_regclass('public.job_aborts') IS NOT NULL,"+
    "'digital',to_regclass('public.driver_digital_credentials') IS NOT NULL,"+
    "'readonly',current_setting('transaction_read_only')"+
    ")::text";
  const txt = execFileSync("psql",["-X","-A","-t","-v","ON_ERROR_STOP=1","-c",query],{
    env,encoding:"utf8",timeout:45000,maxBuffer:2*1024*1024}).trim();
  const state=JSON.parse(txt);
  assert.equal(state.readonly,"on");
  const applied=new Set();
  for (const row of state.history) {
    const pref=row.name.match(/^(\d{14})_/);
    applied.add(pref?pref[1]:row.version);
    if(!pref)applied.add("name:"+row.name);
  }
  const files=readdirSync("supabase/migrations").filter(f=>/^\d{14}_.+\.sql$/.test(f)).sort();
  const pending=files.filter(f=>!applied.has(f.slice(0,14))&&!applied.has("name:"+f.slice(15,-4)));
  console.log(JSON.stringify({project:"axentra-staging",readOnly:true,
    migrationHistoryCount:state.history.length,repoMigrationCount:files.length,
    publicColumnCount:state.columns,publicFunctionCount:state.functions,rlsPolicyCount:state.policies,
    abortTableExists:state.abort,digitalIdTableExists:state.digital,
    pendingCount:pending.length,pendingMigrations:pending,
    verifiedHostedBackup:false},null,2));
  if(pending.length||!state.abort) {
    console.error("BLOCKED: staging schema drift. No migrations applied.");
    process.exitCode=2;
  }
} catch {
  console.error("BLOCKED: cannot safely inspect staging (no changes attempted).");
  process.exitCode=2;
}
