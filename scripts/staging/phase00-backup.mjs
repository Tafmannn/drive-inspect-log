// Local-only encrypted staging backup. Never writes to a hosted database or uploads data.
import { mkdtempSync, mkdirSync, chmodSync, realpathSync, statSync, existsSync, rmSync, writeFileSync, readFileSync, createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const STAGING="mfedxybzajdgavzmajkl", PROD="lynkvfduzqdyvlzgriyh";
const repoRoot=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
const outside=(parent,child)=>{const r=relative(parent,child);return r===".."||r.startsWith(".."+(process.platform==="win32"?"\\":"/"))||isAbsolute(r);};
function checkUrl(raw){
  if(!raw||raw.includes(PROD))throw Error("Missing staging URL or production ref detected");
  const u=new URL(raw), user=decodeURIComponent(u.username), host=u.hostname.toLowerCase();
  if(!["postgres:","postgresql:"].includes(u.protocol)||u.pathname!=="/postgres"||u.hash||!u.password)throw Error("Unsupported DB URL");
  const direct=host==="db."+STAGING+".supabase.co"&&user==="postgres"&&(!u.port||u.port==="5432");
  const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)&&user==="postgres."+STAGING&&(!u.port||u.port==="5432");
  if(!direct&&!pooled)throw Error("Only the exact staging direct/session-pooler endpoint is allowed");
  if([...u.searchParams].some(([k,v])=>k!=="sslmode"||!["require","verify-ca","verify-full"].includes(v)))throw Error("Unsupported connection options");
  if(!u.searchParams.has("sslmode"))u.searchParams.set("sslmode","require");
  return {url:u.toString(),host,user,port:u.port||"5432",password:decodeURIComponent(u.password),sslmode:u.searchParams.get("sslmode")};
}
if(process.argv.includes("--self-test")){
  const a="postgresql://postgres:synthetic@db."+STAGING+".supabase.co:5432/postgres";
  assert.equal(checkUrl(a).host,"db."+STAGING+".supabase.co");
  assert.equal(checkUrl(a).sslmode,"require");
  assert.equal(checkUrl("postgresql://postgres."+STAGING+":synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres").port,"5432");
  for(const v of ["",a.replace(STAGING,PROD),a.replace(".supabase.co",".supabase.co.evil.test"),a+"?host=example.org",a.replace("/postgres","/other"),a.replace("postgres:synthetic","other:synthetic"),"postgresql://postgres."+STAGING+":synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",a+"?sslmode=disable"])assert.throws(()=>checkUrl(v));
  console.log("PASS: staging endpoint guard (synthetic inputs only)");process.exit(0);
}
if(process.argv.length!==3||!process.stdin.isTTY||process.env.CI||process.env.GITHUB_ACTIONS){
 console.error("Local interactive use only: node scripts/staging/phase00-backup.mjs <private-existing-backup-directory>");process.exit(2);
}
process.umask(0o077);
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith("PG")&&!["STAGING_DB_URL","SUPABASE_DB_URL","SUPABASE_ACCESS_TOKEN","SUPABASE_DB_PASSWORD"].includes(k)));
function run(cmd,args,{env=cleanEnv,interactive=false,capture=false}={}){
 const r=spawnSync(cmd,args,{env,stdio:interactive?"inherit":capture?["ignore","pipe","pipe"]:"ignore",encoding:"utf8",timeout:900000,maxBuffer:16*1024*1024});
 if(r.error||r.status!==0)throw Error(cmd+" failed; inspect locally, never paste raw credential-bearing logs");
 return r.stdout||"";
}
async function sha(p){const h=createHash("sha256");for await(const b of createReadStream(p))h.update(b);return h.digest("hex");}
let tmp,archive,verified=false;
try{
 const target=checkUrl(process.env.STAGING_DB_URL);
 const out=realpathSync(resolve(process.argv[2]));
 if(!statSync(out).isDirectory()||!outside(repoRoot,out))throw Error("Backup directory must exist outside the Git checkout");
 if(process.platform!=="win32"&&(statSync(out).mode&0o077))throw Error("Backup directory must be private (chmod 700)");
 const dbEnv={...cleanEnv,PGHOST:target.host,PGPORT:target.port,PGUSER:target.user,PGPASSWORD:target.password,PGDATABASE:"postgres",PGSSLMODE:target.sslmode,PGCONNECT_TIMEOUT:"15",PGOPTIONS:"-c default_transaction_read_only=on -c statement_timeout=30000"};
 const sql=(q)=>run("psql",["-X","-A","-t","-q","-v","ON_ERROR_STOP=1","-c",q],{env:dbEnv,capture:true}).trim();
 const version=run("supabase",["--version"],{capture:true}).trim();
 run("supabase",["db","dump","--help"],{capture:true});
 run("age",["--version"],{capture:true});run("tar",["--version"],{capture:true});run("docker",["info"],{capture:true});
 if(sql("select current_setting('transaction_read_only')")!=="on")throw Error("Source inventory session not read-only");
 const inventory="select json_build_object('organisations',(select count(*) from public.organisations),'jobs',(select count(*) from public.jobs),'auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects),'invoices',(select count(*) from public.invoices),'migrations',(select count(*) from supabase_migrations.schema_migrations));";
 const before=JSON.parse(sql(inventory));
 // Managed storage files and GCS objects require a separate inventory/export; do not infer no external files from DB counts.
 if(before.storage_objects!==0)throw Error("Storage object records exist; prepare a separate file backup before continuing");
 tmp=mkdtempSync(join(out,".axentra-stage-"));chmodSync(tmp,0o700);
 for(const [name,args] of [["roles.sql",["--role-only"]],["schema.sql",[]],["data.sql",["--data-only","--use-copy"]]]){
  console.log("Exporting "+name+" from allowlisted staging source");
  run("supabase",["db","dump","--db-url",target.url,"-f",join(tmp,name),...args]);
  if(!existsSync(join(tmp,name))||!statSync(join(tmp,name)).size)throw Error("Missing or empty "+name);
 }
 writeFileSync(join(tmp,"migration-history.json"),sql("select coalesce(json_agg(json_build_object('version',version,'name',name) order by version),'[]'::json) from supabase_migrations.schema_migrations;")+"\n",{mode:0o600});
 const after=JSON.parse(sql(inventory));
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error("Staging row counts changed during export; stop activity and retry");
 const hashes={};for(const n of ["roles.sql","schema.sql","data.sql","migration-history.json"])hashes[n]=await sha(join(tmp,n));
 writeFileSync(join(tmp,"manifest.json"),JSON.stringify({project:STAGING,createdAt:new Date().toISOString(),cliVersion:version,inventory:before,sha256:hashes,restoreVerified:false,notes:"Counts alone are not snapshot consistency proof. Auth/Storage custom definitions, migration history, integrations and external objects require separate restoration checks."},null,2)+"\n",{mode:0o600});
 const tar=join(tmp,"backup.tar");run("tar",["-cf",tar,"-C",tmp,"roles.sql","schema.sql","data.sql","migration-history.json","manifest.json"]);
 archive=join(out,"axentra-staging-"+new Date().toISOString().replace(/[:.]/g,"-")+".tar.age");
 if(existsSync(archive))throw Error("Backup destination exists");
 console.log("Choose a strong backup passphrase at the age prompt. Keep it separately in your password manager.");
 run("age",["-p","-o",archive,tar],{interactive:true});
 chmodSync(archive,0o600);
 // Authenticate and decrypt the encrypted archive, compare the full tar hash.
 const roundtrip=join(tmp,"roundtrip.tar");
 console.log("Re-enter the passphrase to verify decryption.");
 run("age",["-d","-o",roundtrip,archive],{interactive:true});
 if(await sha(tar)!==await sha(roundtrip))throw Error("Encrypted archive roundtrip mismatch");
 verified=true;
 console.log("Encrypted archive verified: "+archive);
 console.log("Database restore NOT VERIFIED. Complete the separate isolated restore gate before migration.");
}catch(e){
 console.error("BLOCKED: "+(e instanceof Error?e.message:"backup failed"));process.exitCode=2;
}finally{
 if(tmp)rmSync(tmp,{recursive:true,force:true});
 if(archive&&!verified)rmSync(archive,{force:true});
}
