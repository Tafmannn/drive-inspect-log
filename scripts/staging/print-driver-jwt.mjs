#!/usr/bin/env node
// =====================================================================
// print-driver-jwt.mjs — obtain STAGING_DRIVER_A_JWT for release suite 14.
// STAGING ONLY. Run locally; never commit or paste the printed token.
// =====================================================================
// Signs in as a seeded staging driver and prints their access token (JWT)
// and auth user id (sub). Credentials come from the environment so they never
// land in shell history or this repo:
//
//   export STAGING_SUPABASE_URL="https://<staging-ref>.supabase.co"
//   export STAGING_ANON_KEY="<staging anon key>"
//   export STAGING_DRIVER_A_EMAIL="driver.a@staging.test"
//   export STAGING_DRIVER_A_PASSWORD="<that user's password>"
//   node scripts/staging/print-driver-jwt.mjs
//
// Then (without pasting the token in chat):
//   STAGING_DRIVER_A_JWT  = the printed access_token
//   STAGING_DRIVER_SUB    = the printed sub
//
// Uses the repo's existing @supabase/supabase-js — no extra install.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "lynkvfduzqdyvlzgriyh";

const url = process.env.STAGING_SUPABASE_URL || "";
const anon = process.env.STAGING_ANON_KEY || "";
const email = process.env.STAGING_DRIVER_A_EMAIL || "";
const password = process.env.STAGING_DRIVER_A_PASSWORD || "";

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

if (!url || !anon) die("set STAGING_SUPABASE_URL and STAGING_ANON_KEY");
if (!email || !password) die("set STAGING_DRIVER_A_EMAIL and STAGING_DRIVER_A_PASSWORD");
if (url.includes(PROD_REF)) die(`REFUSING: STAGING_SUPABASE_URL references the production ref (${PROD_REF})`);

const supabase = createClient(url, anon, { auth: { persistSession: false } });

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) die(`sign-in failed: ${error.message}`);

const token = data?.session?.access_token;
const sub = data?.user?.id;
if (!token || !sub) die("sign-in returned no session/user");

// Print only what's needed. Token is sensitive and short-lived.
console.log("");
console.log("# Set these (GitHub secrets / .env.staging) — do NOT paste in chat:");
console.log(`STAGING_DRIVER_SUB=${sub}`);
console.log(`STAGING_DRIVER_A_JWT=${token}`);
console.log("");
console.log(`# token expires_at: ${data.session.expires_at} (epoch). Re-run to refresh.`);
process.exit(0);
