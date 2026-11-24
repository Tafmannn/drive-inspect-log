#!/usr/bin/env node
// Staging-only, read-only, encrypted logical archive for Supabase Free.
// Run on a trusted machine with PostgreSQL 17 pg_dump/pg_restore and age.
// Data never enters GitHub source, Actions artifacts, or stdout.
import { execFileSync } from "node:child_process";
import { createReadStream, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const STAGING="mfedxybzajdgavzmajkl",PROD="lynkvfduzqdyvlzgriyh";
function target(raw) {
  if (!raw || raw.includes(PROD)) throw Error("Forbidden database target");
  const u=new URL(raw), host=u.hostname.toLowerCase(), user=decodeURIComponent(u.username);
  if (!["postgres:","postgresql:"].includes(u.protocol) || u.pathname!=="/postgres" ||
      !u.password || u.hash || [...u.searchParams].some(([k,v])=>k!=="sslmode" || !["require","verify-full","verify-ca"].includes(v))) {
    throw Error("Unsupported database URL");
  }
  const direct=host==="db."+STAGING+".supabase.co" && user==="postgres" && (!u.port||u.port==="5432");
  const pool=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) &&
    user==="postgres."+STAGING && ["","5432","6543"].includes(u.port);
  if(!direct&&!pool)throw Error("Only existing Axentra staging project is permitted");
  return {host,user,port:u.port||"5432",password:decodeURIComponent(u.password)};
}
if(process.argv.includes("--self-test")) {
  const v="postgresql://postgres:test@db."+STAGING+".supabase.co:5432/postgres";
  if(target(v).user!=="postgres") throw Error("Staging parser self-test failed");
  for(const bad of [v.replace(STAGING,PROD),v.replace(".supabase.co",".supabase.co.evil.test"),"postgresql://postgres:test@127.0.0.1:54322/postgres"]) {
    let denied=false;try{target(bad);}catch{denied=true;}if(!denied)throw Error("Unsafe target accepted");
  }
  console.log("PASS: backup target is staging-only");
  process.exit(0);
}
let temp;
try {
  const db=target(process.env.STAGING_DB_URL);
  const recipient=process.env.AXENTRA_AGE_RECIPIENT;
  const output=process.env.AXENTRA_BACKUP_DIR;
  if(!recipient?.startsWith("age1") || recipient.length<35)throw Error("Missing valid age public recipient");
  if(!output)throw Error("Specify an OUT-OF-REPOSITORY backup directory");
  const folder=resolve(output), repo=resolve(process.cwd());
  if(folder===repo||folder.startsWith(repo+sep))throw Error("Never save database backups under the Git repository");
  mkdirSync(folder,{recursive:true,mode:0o700});
  const prefix="axentra-staging-"+new Date().toISOString().replace(/[:.]/g,"-");
  const encrypted=join(folder,prefix+".dump.age");
  if(existsSync(encrypted))throw Error("Backup output already exists");
  temp=mkdtempSync(join(tmpdir(),"axentra-staging-"));
  const dump=join(temp,"staging.dump");
  const env={...process.env,PGHOST:db.host,PGPORT:db.port,PGUSER:db.user,
    PGPASSWORD:db.password,PGDATABASE:"postgres",PGSSLMODE:"require",
    PGCONNECT_TIMEOUT:"10",PGOPTIONS:"-c default_transaction_read_only=on"};
  delete env.STAGING_DB_URL;
  // Include relevant public, auth and Storage *metadata*; underlying storage
  // object files are not stored inside PostgreSQL and need separate export.
  execFileSync("pg_dump",[
    "--format=custom","--no-owner","--schema=public","--schema=auth",
    "--schema=storage","--file",dump
  ],{env,timeout:600000,stdio:["ignore","ignore","pipe"]});
  execFileSync("pg_restore",["--list",dump],{stdio:["ignore","ignore","pipe"],timeout:45000});
  execFileSync("age",["-r",recipient,"-o",encrypted,dump],{stdio:["ignore","ignore","pipe"],timeout:180000});
  const digest=createHash("sha256");
  await new Promise((ok,bad)=>{
    const read=createReadStream(encrypted);
    read.on("data",b=>digest.update(b));read.on("error",bad);read.on("end",ok);
  });
  writeFileSync(encrypted+".manifest.json",JSON.stringify({
    project:"axentra-staging",createdAt:new Date().toISOString(),
    encryptedArchive:encrypted.split(sep).at(-1),sha256:digest.digest("hex"),
    includedSchemas:["public","auth","storage"],
    databaseDumpVerifiedReadable:true,
    actualIsolatedRestoreVerified:false,
    storageObjectBytesIncluded:false,
    completeRecoveryReady:false
  },null,2)+"\n",{mode:0o600});
  console.log("PASS: encrypted staging logical database archive created (no plaintext retained by script)");
  console.log("BLOCKED: must still restore it in an isolated environment and separately back up Storage object bytes");
  console.log("Encrypted archive directory: "+folder);
} catch {
  console.error("BLOCKED: encrypted staging backup was not successfully completed. No hosted DB writes attempted.");
  process.exitCode=2;
} finally {
  if(temp)rmSync(temp,{force:true,recursive:true});
}
