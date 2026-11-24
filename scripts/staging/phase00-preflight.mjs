// Phase 00 / Batch 00. Read-only staging preflight, never applies migrations.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const STAGING="mfedxybzajdgavzmajkl", PROD="lynkvfduzqdyvlzgriyh";
function target(raw) {
  if (!raw || raw.includes(PROD)) throw Error("Missing or production database URL");
  const u=new URL(raw), user=decodeURIComponent(u.username), host=u.hostname.toLowerCase();
  if (!["postgres:","postgresql:"].includes(u.protocol)||u.pathname!=="/postgres"||u.hash) throw Error("Unsupported URL");
  const direct=host==="db."+STAGING+".supabase.co"&&user==="postgres"&&(!u.port||u.port==="5432");
  const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)&&user==="postgres."+STAGING&&(!u.port||["5432","6543"].includes(u.port));
  if (!direct&&!pooled) throw Error("Non-allowlisted staging endpoint");
  if ([...u.searchParams].some(([k,v])=>k!=="sslmode"||!["require","verify-ca","verify-full"].includes(v))) throw Error("Unsupported connection option");
  if (!u.password) throw Error("Missing database password");
  return {host,user,port:u.port||"5432",password:decodeURIComponent(u.password)};
}
function pending(files,history) {
  const applied=new Set();
  for(const row of history){
    const name=row.name||"", pref=name.match(/^(\d{14})_/);
    applied.add(pref?pref[1]:row.version);
    if(!pref) applied.add("name:"+name);
  }
  return files.filter(f=>/^\d{14}_.+\.sql$/.test(f)).sort().filter(f=>!applied.has(f.slice(0,14))&&!applied.has("name:"+f.slice(15,-4)));
}
if(process.argv.includes("--self-test")){
  const a="postgresql://postgres:synthetic@db."+STAGING+".supabase.co:5432/postgres";
  assert.equal(target(a).host,"db."+STAGING+".supabase.co");
  assert.equal(target("postgresql://postgres."+STAGING+":synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres").port,"6543");
  for(const u of ["",a.replace(STAGING,PROD),a.replace(".supabase.co",".supabase.co.evil.test"),a+"?host=example.org",a.replace("/postgres","/other"),a.replace("postgres:synthetic","other:synthetic")])assert.throws(()=>target(u));
  const files=["20260101000000_alpha.sql","20260102000000_beta.sql","20260103000000_gamma.sql","20260104000000_delta.sql"];
  const history=[{version:"20260101000000",name:"alpha"},{version:"20260201000000",name:"20260102000000_beta"},{version:"20260202000000",name:"gamma"}];
  assert.deepEqual(pending(files,history),[files[3]]);
  assert.equal(pending(files,[]).length,4);
  console.log("PASS: staging URL and migration alias tests");
  process.exit(0);
}
try{
  const t=target(process.env.STAGING_DB_URL);
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith("PG")&&k!=="STAGING_DB_URL"));
  Object.assign(env,{PGHOST:t.host,PGPORT:t.port,PGUSER:t.user,PGPASSWORD:t.password,PGDATABASE:"postgres",PGSSLMODE:"require",PGCONNECT_TIMEOUT:"10",PGOPTIONS:"-c default_transaction_read_only=on -c statement_timeout=30000"});
  const sql="select json_build_object('history',(select coalesce(json_agg(json_build_object('version',version,'name',name)),'[]'::json) from supabase_migrations.schema_migrations),'columns',(select count(*) from information_schema.columns where table_schema='public'),'policies',(select count(*) from pg_policies where schemaname in ('public','storage')),'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),'read_only',current_setting('transaction_read_only'));";
  const r=spawnSync("psql",["-X","-A","-t","-q","-v","ON_ERROR_STOP=1","-c",sql],{env,encoding:"utf8",timeout:45000,maxBuffer:1024*1024});
  if(r.error||r.status!==0)throw Error("Read-only staging query failed; check connectivity without logging credentials");
  const v=JSON.parse(r.stdout.trim());
  if(v.read_only!=="on")throw Error("Session was not read-only");
  const missing=pending(readdirSync(fileURLToPath(new URL("../../supabase/migrations/",import.meta.url))),v.history);
  console.log(JSON.stringify({pendingCount:missing.length,pending:missing,columns:v.columns,policies:v.policies,functions:v.functions,readOnly:true},null,2));
  if(missing.length||v.columns<729||v.policies<147||v.functions<90){console.error("BLOCKED: staging baseline incomplete");process.exitCode=2;}
  else console.log("Inventory floor met. Definition parity and verified backup gates remain.");
}catch{console.error("BLOCKED: missing/unsafe target or unavailable read-only staging metadata");process.exitCode=2;}
