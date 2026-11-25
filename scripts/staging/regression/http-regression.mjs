// Axentra STAGING HTTP regression suite — real identities, real API.
// Signs in as synthetic fixture users (scripts/staging/regression/fixtures.sql)
// through Supabase Auth and exercises PostgREST tables + RPCs with each user's
// JWT, so RLS, grants and SECURITY DEFINER guards are tested exactly as the app
// hits them. Never uses a service-role key.
//
//   STAGING_FIXTURE_PASSWORD=... node scripts/staging/regression/http-regression.mjs [--json out.json]
//
// Fails closed unless the URL is the staging project. Writes only fixture rows
// in fixture orgs (ZZ Staging Fixture Org A/B). Exit 1 if any test fails.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const STAGING_REF = "mfedxybzajdgavzmajkl";
const PROD_REF = "lynkvfduzqdyvlzgriyh";
const URL = process.env.STAGING_SUPABASE_URL || `https://${STAGING_REF}.supabase.co`;
const KEY = process.env.STAGING_PUBLISHABLE_KEY || "sb_publishable_QG0-o_bpRj2GzXRmA_H0mg_6zTH3Rbe";
const PASSWORD = process.env.STAGING_FIXTURE_PASSWORD;
if (new globalThis.URL(URL).hostname !== `${STAGING_REF}.supabase.co` || URL.includes(PROD_REF) || KEY.includes(PROD_REF)) {
  console.error("BLOCKED: staging URL/key required"); process.exit(2);
}
if (!PASSWORD) { console.error("BLOCKED: STAGING_FIXTURE_PASSWORD not set"); process.exit(2); }

const ORG_A = "5f000000-0000-4000-8000-00000000000a", ORG_B = "5f000000-0000-4000-8000-00000000000b";
const JOB_A1 = "5f000000-0000-4000-8000-0000000a0001", JOB_A2 = "5f000000-0000-4000-8000-0000000a0002", JOB_B1 = "5f000000-0000-4000-8000-0000000b0001";
const CLIENT_A = "5f000000-0000-4000-8000-0000000c000a";
const UID = { aDriver: "5f000000-0000-4000-8000-0000000000a2", aSusp: "5f000000-0000-4000-8000-0000000000a3", aDual: "5f000000-0000-4000-8000-0000000000a4", bDriver: "5f000000-0000-4000-8000-0000000000b2" };
const EMAIL = {
  aAdmin: "zz-a-admin", aDriver: "zz-a-driver", aSusp: "zz-a-suspended", aDual: "zz-a-dualrole", aClient: "zz-a-client",
  bAdmin: "zz-b-admin", bDriver: "zz-b-driver", bClient: "zz-b-client", superAdmin: "zz-superadmin",
};
const RUN = Date.now().toString(36);
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const clients = { anon: mk() };
const results = [];
const ids = (rows) => (rows || []).map((r) => r.id).sort();
async function signIn(name) {
  const c = mk();
  const { error } = await c.auth.signInWithPassword({ email: `${EMAIL[name]}@axentra-staging.test`, password: PASSWORD });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  clients[name] = c; return c;
}
async function test(category, name, fn) {
  try {
    const r = await fn();
    results.push({ category, name, status: r.pass ? "VERIFIED PASS" : "VERIFIED FAIL", detail: r.detail });
  } catch (e) {
    results.push({ category, name, status: "VERIFIED FAIL", detail: "threw: " + (e?.message || e) });
  }
}
const denied = (res) => !!res.error || (Array.isArray(res.data) && res.data.length === 0) || res.data === null;
const errMsg = (res) => res.error ? `${res.error.code || ""} ${res.error.message}`.trim() : "no error";

// ---------- sign-in (suspended account: Auth may allow, data access must not) ----------
for (const n of ["aAdmin", "aDriver", "aDual", "aClient", "bAdmin", "bDriver", "bClient", "superAdmin"]) await signIn(n);
let suspSignedIn = true;
try { await signIn("aSusp"); } catch { suspSignedIn = false; }

// ---------- SECURITY ----------
await test("security", "anon cannot read jobs, profiles, invoices, organisations, clients", async () => {
  const t = ["jobs", "user_profiles", "invoices", "organisations", "clients", "driver_profiles", "job_pricing"];
  const out = await Promise.all(t.map((x) => clients.anon.from(x).select("id").limit(5)));
  const leaks = t.filter((x, i) => !denied(out[i]));
  return { pass: leaks.length === 0, detail: leaks.length ? "rows visible: " + leaks : "all denied/empty" };
});
await test("security", "anon cannot call privileged RPCs", async () => {
  const a = await clients.anon.rpc("super_admin_override_job_status", { p_job_id: JOB_A1, p_new_status: "cancelled", p_reason: "x" });
  const b = await clients.anon.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  const c = await clients.anon.rpc("get_driver_digital_id", { p_user_id: UID.aDriver });
  return { pass: !!a.error && !!b.error && !!c.error, detail: [errMsg(a), errMsg(b), errMsg(c)].join(" | ") };
});
await test("security", "driver A sees only own assigned job (no unassigned, no other org)", async () => {
  const r = await clients.aDriver.from("jobs").select("id").in("id", [JOB_A1, JOB_A2, JOB_B1]);
  return { pass: !r.error && JSON.stringify(ids(r.data)) === JSON.stringify([JOB_A1]), detail: errMsg(r) + " ids=" + ids(r.data) };
});
await test("security", "driver B sees only own job", async () => {
  const r = await clients.bDriver.from("jobs").select("id").in("id", [JOB_A1, JOB_A2, JOB_B1]);
  return { pass: !r.error && JSON.stringify(ids(r.data)) === JSON.stringify([JOB_B1]), detail: "ids=" + ids(r.data) };
});
await test("security", "admin A sees org A jobs only", async () => {
  const r = await clients.aAdmin.from("jobs").select("id").in("id", [JOB_A1, JOB_A2, JOB_B1]);
  return { pass: JSON.stringify(ids(r.data)) === JSON.stringify([JOB_A1, JOB_A2].sort()), detail: "ids=" + ids(r.data) };
});
await test("security", "admin B cannot see org A jobs or clients", async () => {
  const j = await clients.bAdmin.from("jobs").select("id").in("id", [JOB_A1, JOB_A2]);
  const c = await clients.bAdmin.from("clients").select("id").eq("org_id", ORG_A);
  return { pass: denied(j) && denied(c), detail: `jobs=${ids(j.data)} clients=${ids(c.data)}` };
});
await test("security", "super admin inherits cross-org visibility", async () => {
  const r = await clients.superAdmin.from("jobs").select("id").in("id", [JOB_A1, JOB_A2, JOB_B1]);
  return { pass: ids(r.data).length === 3, detail: "visible=" + ids(r.data).length };
});
await test("security", "suspended account has no data access", async () => {
  if (!suspSignedIn) return { pass: true, detail: "Auth refused sign-in" };
  const r = await clients.aSusp.from("jobs").select("id").in("id", [JOB_A1, JOB_A2]);
  const d = await clients.aSusp.rpc("get_driver_digital_id", {});
  return { pass: denied(r) && !!d.error, detail: `jobs=${ids(r.data)} digitalId=${errMsg(d)}` };
});
await test("security", "driver cannot escalate own role or change org", async () => {
  const u1 = await clients.aDriver.from("user_profiles").update({ role: "admin" }).eq("auth_user_id", UID.aDriver).select("role");
  const u2 = await clients.aDriver.from("user_profiles").update({ org_id: ORG_B }).eq("auth_user_id", UID.aDriver).select("org_id");
  const now = await clients.aDriver.from("user_profiles").select("role,org_id").eq("auth_user_id", UID.aDriver).single();
  return { pass: now.data?.role === "driver" && now.data?.org_id === ORG_A, detail: `${errMsg(u1)} | ${errMsg(u2)} | now=${JSON.stringify(now.data)}` };
});
await test("security", "driver cannot create jobs or re-assign/move a job", async () => {
  const ins = await clients.aDriver.from("jobs").insert({ org_id: ORG_A, vehicle_reg: "ZZ" + RUN, vehicle_make: "x", vehicle_model: "x", vehicle_colour: "x",
    pickup_contact_name: "x", pickup_contact_phone: "x", pickup_address_line1: "x", pickup_city: "x", pickup_postcode: "x",
    delivery_contact_name: "x", delivery_contact_phone: "x", delivery_address_line1: "x", delivery_city: "x", delivery_postcode: "x" }).select("id");
  const upd = await clients.aDriver.from("jobs").update({ org_id: ORG_B }).eq("id", JOB_A1).select("id");
  const chk = await clients.aAdmin.from("jobs").select("org_id").eq("id", JOB_A1).single();
  return { pass: denied(ins) && chk.data?.org_id === ORG_A, detail: `insert=${errMsg(ins)} update=${errMsg(upd)} org=${chk.data?.org_id === ORG_A ? "A" : chk.data?.org_id}` };
});
await test("security", "admin A cannot modify org B job", async () => {
  const u = await clients.aAdmin.from("jobs").update({ vehicle_colour: "Hacked" }).eq("id", JOB_B1).select("id");
  const chk = await clients.bAdmin.from("jobs").select("vehicle_colour").eq("id", JOB_B1).single();
  return { pass: denied(u) && chk.data?.vehicle_colour === "Blue", detail: `${errMsg(u)} colour=${chk.data?.vehicle_colour}` };
});
await test("security", "status override RPC is super-admin only", async () => {
  const d = await clients.aDriver.rpc("super_admin_override_job_status", { p_job_id: JOB_A2, p_new_status: "cancelled", p_reason: "regression" });
  const a = await clients.aAdmin.rpc("super_admin_override_job_status", { p_job_id: JOB_A2, p_new_status: "cancelled", p_reason: "regression" });
  const chk = await clients.aAdmin.from("jobs").select("status").eq("id", JOB_A2).single();
  return { pass: !!d.error && !!a.error && chk.data?.status === "ready_for_pickup", detail: `driver=${errMsg(d)} admin=${errMsg(a)} status=${chk.data?.status}` };
});
await test("security", "cross-org invoice number allocation refused", async () => {
  const r = await clients.bAdmin.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  return { pass: !!r.error, detail: errMsg(r) };
});
await test("security", "permission tables: driver cannot write role templates", async () => {
  const r = await clients.aDriver.from("role_permission_templates").update({ is_allowed: true }).eq("role", "driver").select("role");
  const chk = await clients.superAdmin.from("role_permission_templates").select("is_allowed").eq("role", "driver").eq("permission_key", "pod.view").single();
  return { pass: denied(r) && chk.data?.is_allowed === false, detail: `${errMsg(r)} driver pod.view=${chk.data?.is_allowed}` };
});
await test("security", "private storage: anon and other-org users cannot list or read org A objects", async () => {
  const buckets = ["pod-photos", "vehicle-photos", "vehicle-signatures", "invoice-pdfs", "digital-id-photos", "pod-pdfs", "expense-receipts", "onboarding-docs"];
  const leaks = [];
  for (const b of buckets) {
    const a = await clients.anon.storage.from(b).list(ORG_A);
    const x = await clients.bAdmin.storage.from(b).list(ORG_A);
    if ((a.data || []).length) leaks.push("anon:" + b);
    if ((x.data || []).length) leaks.push("orgB:" + b);
  }
  const pub = await clients.anon.storage.listBuckets();
  return { pass: leaks.length === 0, detail: leaks.length ? "leaks " + leaks : `no listing leaks (anon bucket list: ${(pub.data || []).length})` };
});

// ---------- OPERATIONAL ----------
let newJob = null;
await test("operational", "admin creates job and assigns driver; driver then sees it", async () => {
  const ins = await clients.aAdmin.from("jobs").insert({ org_id: ORG_A, client_id: CLIENT_A, vehicle_reg: "ZZ" + RUN.slice(-5).toUpperCase(), vehicle_make: "Ford", vehicle_model: "Fiesta", vehicle_colour: "Red",
    pickup_contact_name: "ZZ", pickup_contact_phone: "07000000002", pickup_address_line1: "3 Fixture Road", pickup_city: "Testtown", pickup_postcode: "ZZ1 3ZZ",
    delivery_contact_name: "ZZ", delivery_contact_phone: "07000000003", delivery_address_line1: "4 Fixture Road", delivery_city: "Testtown", delivery_postcode: "ZZ1 4ZZ" }).select("id,status").single();
  if (ins.error) return { pass: false, detail: "insert " + errMsg(ins) };
  newJob = ins.data.id;
  const asg = await clients.aAdmin.from("jobs").update({ driver_id: "5f000000-0000-4000-8000-00000000d0a2", status: "assigned" }).eq("id", newJob).select("id");
  const seen = await clients.aDriver.from("jobs").select("id").eq("id", newJob);
  const other = await clients.bDriver.from("jobs").select("id").eq("id", newJob);
  return { pass: !asg.error && ids(seen.data).length === 1 && denied(other), detail: `created status=${ins.data.status} assign=${errMsg(asg)} driverA=${ids(seen.data).length} driverB=${ids(other.data).length}` };
});
await test("operational", "abort: only assigned driver may request; admin confirms", async () => {
  if (!newJob) return { pass: false, detail: "no job" };
  const wrong = await clients.bDriver.rpc("request_job_abort", { p_job_id: newJob });
  const req = await clients.aDriver.rpc("request_job_abort", { p_job_id: newJob });
  if (req.error) return { pass: false, detail: `wrong=${errMsg(wrong)} request=${errMsg(req)}` };
  const conf = await clients.aAdmin.rpc("confirm_job_abort", { p_job_id: newJob, p_contact_name: "ZZ Contact", p_no_name_exception: false, p_expected_status: "assigned" });
  const st = await clients.aAdmin.from("jobs").select("status").eq("id", newJob).single();
  return { pass: !!wrong.error && !conf.error && st.data?.status === "aborted", detail: `wrongDriver=${errMsg(wrong)} confirm=${errMsg(conf)} status=${st.data?.status}` };
});
await test("operational", "abort fee: driver cannot approve own claim", async () => {
  if (!newJob) return { pass: false, detail: "no job" };
  const ab = await clients.aAdmin.from("job_aborts").select("id").eq("job_id", newJob).maybeSingle();
  if (!ab.data) return { pass: false, detail: "no job_aborts row: " + errMsg(ab) };
  const d = await clients.aDriver.rpc("review_job_abort_claim", { p_abort_id: ab.data.id, p_decision: "approved", p_amount: 50, p_note: "x", p_client_confirmed: true });
  return { pass: !!d.error, detail: `abort row present; driverReview=${errMsg(d)}` };
});

// ---------- FINANCE ----------
let inv1 = null;
await test("finance", "invoice numbers allocate sequentially and uniquely per org", async () => {
  const a = await clients.aAdmin.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  const b = await clients.aAdmin.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  return { pass: !a.error && !b.error && a.data !== b.data, detail: `${JSON.stringify(a.data)} then ${JSON.stringify(b.data)} ${errMsg(a)}` };
});
const freshJob = async (label) => {
  const r = await clients.aAdmin.from("jobs").insert({ org_id: ORG_A, client_id: CLIENT_A, vehicle_reg: "ZY" + label + RUN.slice(-4).toUpperCase(), vehicle_make: "Ford", vehicle_model: "Ka", vehicle_colour: "Grey",
    pickup_contact_name: "ZZ", pickup_contact_phone: "07000000004", pickup_address_line1: "5 Fixture Road", pickup_city: "Testtown", pickup_postcode: "ZZ1 5ZZ",
    delivery_contact_name: "ZZ", delivery_contact_phone: "07000000005", delivery_address_line1: "6 Fixture Road", delivery_city: "Testtown", delivery_postcode: "ZZ1 6ZZ" }).select("id").single();
  if (r.error) throw new Error("fresh job: " + errMsg(r));
  return r.data.id;
};
await test("finance", "one live invoice per job (duplicate invoice blocked)", async () => {
  const JOB = await freshJob("I");
  const num = await clients.aAdmin.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  const i1 = await clients.aAdmin.from("invoices").insert({ org_id: ORG_A, invoice_number: num.data, client_name: "ZZ Fixture Client A1", client_id: CLIENT_A, job_id: JOB, subtotal: 100, total: 120, vat_rate: 20, vat_amount: 20 }).select("id,status").single();
  if (i1.error) return { pass: false, detail: "first insert " + errMsg(i1) };
  inv1 = i1.data.id;
  const num2 = await clients.aAdmin.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  const i2 = await clients.aAdmin.from("invoices").insert({ org_id: ORG_A, invoice_number: num2.data, client_name: "ZZ Fixture Client A1", client_id: CLIENT_A, job_id: JOB, subtotal: 100, total: 120 }).select("id");
  return { pass: !!i2.error, detail: `first=${i1.data.status} second=${errMsg(i2)}` };
});
await test("finance", "money columns keep 2dp precision (numeric(10,2))", async () => {
  if (!inv1) return { pass: false, detail: "no invoice" };
  const u = await clients.aAdmin.from("invoices").update({ subtotal: 100.005 }).eq("id", inv1).select("subtotal").single();
  return { pass: !u.error && Number(u.data.subtotal) === 100.01, detail: `${errMsg(u)} stored=${u.data?.subtotal}` };
});
await test("finance", "other org cannot read the invoice", async () => {
  if (!inv1) return { pass: false, detail: "no invoice" };
  const r = await clients.bAdmin.from("invoices").select("id").eq("id", inv1);
  const d = await clients.aDriver.from("invoices").select("id").eq("id", inv1);
  return { pass: denied(r), detail: `orgB=${ids(r.data).length} driverA=${ids(d.data).length}` };
});

// ---------- CUSTOMER PORTAL ----------
await test("portal", "client sees only own client's jobs via portal RPC", async () => {
  const r = await clients.aClient.rpc("portal_list_jobs");
  const list = (Array.isArray(r.data) ? r.data : r.data?.jobs || []).map((j) => j.id);
  const b = await clients.aClient.rpc("portal_get_job", { p_job_id: JOB_B1 });
  return { pass: !r.error && list.includes(JOB_A1) && !list.includes(JOB_B1) && (!!b.error || !b.data), detail: `${errMsg(r)} count=${list.length} foreign=${errMsg(b)}` };
});
await test("portal", "client cannot read jobs/invoices tables directly", async () => {
  const j = await clients.aClient.from("jobs").select("id").limit(5);
  const i = await clients.aClient.from("invoices").select("id").limit(5);
  return { pass: denied(j) && denied(i), detail: `jobs=${ids(j.data).length} invoices=${ids(i.data).length}` };
});
await test("portal", "unsent invoice hidden from portal; other client never sees it", async () => {
  const a = await clients.aClient.rpc("portal_list_invoices");
  const b = await clients.bClient.rpc("portal_list_invoices");
  const has = (x) => (x.data || []).some((v) => v.id === inv1);
  return { pass: !a.error && !has(a) && !has(b), detail: `clientA=${(a.data || []).length} clientB=${(b.data || []).length} ${errMsg(a)}` };
});
await test("portal", "portal user cannot call admin RPCs", async () => {
  const r = await clients.aClient.rpc("allocate_invoice_number", { p_org_id: ORG_A });
  return { pass: !!r.error, detail: errMsg(r) };
});

// ---------- DIGITAL ID ----------
await test("digital-id", "driver gets own auto-issued credential", async () => {
  const r = await clients.aDriver.rpc("get_driver_digital_id", {});
  return { pass: !r.error && !!r.data, detail: `${errMsg(r)} keys=${r.data ? Object.keys(r.data).slice(0, 6) : "none"}` };
});
await test("digital-id", "driver cannot read another driver's credential", async () => {
  const r = await clients.aDriver.rpc("get_driver_digital_id", { p_user_id: UID.bDriver });
  return { pass: !!r.error, detail: errMsg(r) };
});
await test("digital-id", "admin reads own-org credential, not other org", async () => {
  const a = await clients.aAdmin.rpc("get_driver_digital_id", { p_user_id: UID.aDriver });
  const b = await clients.aAdmin.rpc("get_driver_digital_id", { p_user_id: UID.bDriver });
  return { pass: !a.error && !!a.data && !!b.error, detail: `own=${errMsg(a)} other=${errMsg(b)}` };
});
await test("digital-id", "dual-role admin+driver holds a credential", async () => {
  const r = await clients.aDual.rpc("get_driver_digital_id", {});
  return { pass: !r.error && !!r.data, detail: errMsg(r) };
});

const counts = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
for (const r of results) console.log(`${r.status.padEnd(13)} [${r.category}] ${r.name} — ${r.detail}`);
console.log("\nSUMMARY", JSON.stringify(counts), "run", RUN);
const j = process.argv.indexOf("--json");
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify({ run: RUN, target: URL, results }, null, 2));
process.exit(results.some((r) => r.status !== "VERIFIED PASS") ? 1 : 0);
