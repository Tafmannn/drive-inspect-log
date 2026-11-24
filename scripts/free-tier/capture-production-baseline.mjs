#!/usr/bin/env node
// Read-only, schema-only export for a trusted Axentra production BASELINE.
// Does not export customer data rows, deploy, migrate or link Supabase.
// Deliberately DOES NOT auto-commit the schema: a human must inspect SQL
// functions for hard-coded secrets and approve its provenance first.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";

const PROD="lynkvfduzqdyvlzgriyh";
const STAGING="mfedxybzajdgavzmajkl";
function verifyProductionUrl(raw) {
  if(!raw || raw.includes(STAGING))throw Error("Missing or prohibited source");
  const u=new URL(raw),host=u.hostname.toLowerCase(),user=decodeURIComponent(u.username);
  if(!["postgres:","postgresql:"].includes(u.protocol)||u.pathname!=="/postgres"||
    !u.password||u.hash||[...u.searchParams].some(([k,v])=>k!=="sslmode"||!["require","verify-full","verify-ca"].includes(v))) {
    throw Error("Unsupported production connection settings");
  }
  const direct=host==="db."+PROD+".supabase.co" && user==="postgres"&&(!u.port||u.port==="5432");
  const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)&&user==="postgres."+PROD&&["","5432","6543"].includes(u.port);
  if(!direct&&!pooled)throw Error("Source must be exactly Axentra production project");
  return {host,user,port:u.port||"5432",password:decodeURIComponent(u.password)};
}
if(process.argv.includes("--self-test")) {
  const sample="postgresql://postgres:synthetic@db."+PROD+".supabase.co:5432/postgres";
  if(verifyProductionUrl(sample).user!=="postgres")throw Error("Valid source rejected");
  for(const bad of [sample.replace(PROD,STAGING),sample.replace(".supabase.co",".supabase.co.evil.test"),"postgresql://postgres:synthetic@127.0.0.1:54322/postgres"]) {
    let blocked=false;try{verifyProductionUrl(bad);}catch{blocked=true;}if(!blocked)throw Error("Unsafe source accepted");
  }
  console.log("PASS: production baseline capture is read-only and target-allowlisted");
  process.exit(0);
}
try{
  const target=verifyProductionUrl(process.env.PRODUCTION_DB_URL);
  const rawOut=process.env.AXENTRA_SCHEMA_OUTPUT_DIR;
  if(!rawOut)throw Error("Output directory required");
  const out=resolve(rawOut),repo=resolve(process.cwd());
  if(out===repo||out.startsWith(repo+sep))throw Error("Never auto-save unreviewed production SQL inside a repository");
  mkdirSync(out,{recursive:true,mode:0o700});
  const time=new Date().toISOString().replace(/[:.]/g,"-");
  const file=join(out,"axentra-production-schema-"+time+".sql");
  const env={...process.env,PGHOST:target.host,PGPORT:target.port,PGUSER:target.user,
    PGDATABASE:"postgres",PGPASSWORD:target.password,PGSSLMODE:"require",
    PGCONNECT_TIMEOUT:"10",PGOPTIONS:"-c default_transaction_read_only=on"};
  delete env.PRODUCTION_DB_URL;
  const migration=execFileSync("psql",["-X","-A","-t","-v","ON_ERROR_STOP=1","-c",
    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1"],{
      env,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
  execFileSync("pg_dump",[
    "--schema-only","--schema=public","--no-owner","--file",file
  ],{env,timeout:600000,stdio:["ignore","ignore","pipe"]});
  const hash=createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(file+".manifest.json",JSON.stringify({
    source:"Axentra production (read-only)",projectRef:PROD,
    capturedAt:new Date().toISOString(),maxRecordedMigration:migration,
    dataRowsIncluded:false,sha256:hash,
    restoreTested:false,securityReviewed:false,approvedForCi:false,
    warning:"Review source and grants, scrub embedded secrets, and verify against disposable Postgres before importing"
  },null,2)+"\n",{mode:0o600});
  console.log("PASS: production public-schema-only DDL captured without writes or data rows.");
  console.log("RELEASE STATUS: NOT APPROVED — baseline requires source review, snapshot restore and migration parity.");
  console.log("Local output directory: "+out);
}catch{
  console.error("BLOCKED: unable to capture a safe production schema-only snapshot. No DB writes attempted.");
  process.exitCode=2;
}
