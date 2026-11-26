// Axentra STAGING inspection → POD → completion workflow regression.
// Real fixture identities (scripts/staging/regression/fixtures.sql), real
// PostgREST/RPC/Storage/Edge Function calls; never a service-role key.
// Every run creates its own fresh job in fixture org A, so it is re-runnable.
//
//   NODE_USE_ENV_PROXY=1 STAGING_FIXTURE_PASSWORD=... node scripts/staging/regression/workflow-regression.mjs [--json out.json]
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
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

const ORG_A = "5f000000-0000-4000-8000-00000000000a";
const CLIENT_A = "5f000000-0000-4000-8000-0000000c000a";
const DRIVER_A = "5f000000-0000-4000-8000-00000000d0a2";
const RUN = Date.now().toString(36);
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const c = { anon: mk() };
const results = [];
const errMsg = (r) => (r?.error ? `${r.error.code || ""} ${r.error.message}`.trim() : "no error");
const denied = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0) || r.data === null;
async function signIn(name, email) {
  const x = mk();
  const { error } = await x.auth.signInWithPassword({ email: `${email}@axentra-staging.test`, password: PASSWORD });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  c[name] = x;
}
async function test(category, name, fn) {
  try {
    const r = await fn();
    results.push({ category, name, status: r.pass ? "VERIFIED PASS" : "VERIFIED FAIL", detail: r.detail });
  } catch (e) {
    results.push({ category, name, status: "VERIFIED FAIL", detail: "threw: " + (e?.message || e) });
  }
}
async function fn(name, who, body) {
  const token = (await c[who].auth.getSession()).data.session?.access_token;
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST", headers: { apikey: KEY, "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

for (const [n, e] of [["aAdmin", "zz-a-admin"], ["aDriver", "zz-a-driver"], ["bAdmin", "zz-b-admin"], ["bDriver", "zz-b-driver"]]) await signIn(n, e);

// Fresh job for this run, assigned to driver A, with a real-looking customer
// address on file (it must never receive mail from staging).
const reg = ("ZW" + RUN.slice(-5)).toUpperCase();
const created = await c.aAdmin.from("jobs").insert({
  org_id: ORG_A, client_id: CLIENT_A, driver_id: DRIVER_A, status: "assigned",
  vehicle_reg: reg, vehicle_make: "Vauxhall", vehicle_model: "Corsa", vehicle_colour: "White",
  pickup_contact_name: "ZZ Pickup", pickup_contact_phone: "07000000010", pickup_address_line1: "10 Fixture Road", pickup_city: "Testtown", pickup_postcode: "ZZ1 7ZZ",
  delivery_contact_name: "ZZ Delivery", delivery_contact_phone: "07000000011", delivery_address_line1: "11 Fixture Road", delivery_city: "Testtown", delivery_postcode: "ZZ1 8ZZ",
  delivery_contact_email: "customer@example.com",
}).select("id,current_run_id").single();
if (created.error) { console.error("BLOCKED: could not create workflow job: " + errMsg(created)); process.exit(2); }
const JOB = created.data.id;
const sessionId = randomUUID();
const sigDriver = `https://${STAGING_REF}.supabase.co/storage/v1/object/vehicle-signatures/${ORG_A}/${JOB}/pickup/driver.png`;
const sigCustomer = `https://${STAGING_REF}.supabase.co/storage/v1/object/vehicle-signatures/${ORG_A}/${JOB}/pickup/customer.png`;
const pickupPayload = {
  odometer: 12345, fuel_level_percent: 60, number_of_keys: "2", vehicle_condition: "good", light_condition: "daylight",
  customer_name: "ZZ Customer", inspected_by_name: "ZZ Driver A", damage_declaration: "recorded",
  driver_signature_url: sigDriver, customer_signature_url: sigCustomer, notes: "workflow regression " + RUN,
};
const damage = [{ x: 0.42, y: 0.31, area: "front", location: "bumper", item: "bumper", damage_types: ["scratch"], notes: "ZZ test scratch", severity: "minor", view_id: "front" }];
let pickup = null;

// ---------- INSPECTIONS ----------
await test("inspection", "other-org driver cannot submit an inspection for this job", async () => {
  const r = await c.bDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "pickup", p_inspection: pickupPayload, p_damage_items: [], p_submission_session_id: randomUUID() });
  return { pass: !!r.error, detail: errMsg(r) };
});
await test("inspection", "delivery cannot be submitted before pickup", async () => {
  const r = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "delivery", p_inspection: { odometer: 12400 }, p_damage_items: [], p_submission_session_id: randomUUID() });
  return { pass: !!r.error && /PICKUP_NOT_COMPLETE/.test(errMsg(r)), detail: errMsg(r) };
});
await test("inspection", "assigned driver submits pickup with damage + signatures → pickup_complete", async () => {
  const r = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "pickup", p_inspection: pickupPayload, p_damage_items: damage, p_submission_session_id: sessionId });
  if (r.error) return { pass: false, detail: errMsg(r) };
  pickup = r.data;
  const j = await c.aAdmin.from("jobs").select("status,has_pickup_inspection").eq("id", JOB).single();
  return { pass: r.data.toStatus === "pickup_complete" && j.data?.status === "pickup_complete" && j.data?.has_pickup_inspection === true && (r.data.damageItemIds || []).length === 1,
    detail: `toStatus=${r.data.toStatus} job=${j.data?.status} damage=${(r.data.damageItemIds || []).length}` };
});
await test("inspection", "offline retry (same submission session) is an idempotent replay", async () => {
  const r = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "pickup", p_inspection: pickupPayload, p_damage_items: damage, p_submission_session_id: sessionId });
  const n = await c.aAdmin.from("inspections").select("id").eq("job_id", JOB).eq("type", "pickup");
  const d = await c.aAdmin.from("damage_items").select("id").eq("inspection_id", pickup?.inspectionId).is("archived_at", null);
  return { pass: !r.error && r.data?.idempotentReplay === true && r.data?.inspectionId === pickup?.inspectionId && n.data?.length === 1 && d.data?.length === 1,
    detail: `${errMsg(r)} replay=${r.data?.idempotentReplay} inspections=${n.data?.length} damage=${d.data?.length} ${d.error ? errMsg(d) : ""}` };
});
await test("inspection", "duplicate submission (new session) after completion is refused", async () => {
  const r = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "pickup", p_inspection: { odometer: 1 }, p_damage_items: [], p_submission_session_id: randomUUID() });
  const i = await c.aAdmin.from("inspections").select("odometer").eq("id", pickup?.inspectionId).single();
  return { pass: !!r.error && /INSPECTION_ALREADY_SUBMITTED/.test(errMsg(r)) && i.data?.odometer === 12345, detail: `${errMsg(r)} odometer=${i.data?.odometer}` };
});
await test("inspection", "signatures and readings persisted on the inspection", async () => {
  const i = await c.aAdmin.from("inspections").select("driver_signature_url,customer_signature_url,fuel_level_percent,customer_name,damage_declaration").eq("id", pickup?.inspectionId).single();
  return { pass: i.data?.driver_signature_url === sigDriver && i.data?.customer_signature_url === sigCustomer && i.data?.fuel_level_percent === 60 && i.data?.damage_declaration === "recorded",
    detail: errMsg(i) + " " + JSON.stringify({ ...i.data, driver_signature_url: !!i.data?.driver_signature_url, customer_signature_url: !!i.data?.customer_signature_url }) };
});
await test("inspection", "damage record visible to own org, hidden from other org", async () => {
  const a = await c.aAdmin.from("damage_items").select("id,severity").eq("inspection_id", pickup?.inspectionId);
  const b = await c.bAdmin.from("damage_items").select("id").eq("inspection_id", pickup?.inspectionId);
  return { pass: a.data?.length === 1 && a.data[0].severity === "minor" && denied(b), detail: `orgA=${a.data?.length} orgB=${b.data?.length ?? errMsg(b)}` };
});

// ---------- EVIDENCE (photo metadata; file transport is GCS) ----------
let photoId = null;
const backendRef = `${ORG_A}/jobs/${JOB}/pickup/front-${RUN}.jpg`;
const photoRow = () => ({ job_id: JOB, inspection_id: pickup?.inspectionId, type: "pickup_front", url: `gcs://${backendRef}`, backend: "googleCloud", backend_ref: backendRef, run_id: created.data.current_run_id, label: "ZZ front" });
await test("evidence", "driver records photo evidence for own job", async () => {
  const r = await c.aDriver.from("photos").insert(photoRow()).select("id,org_id").single();
  photoId = r.data?.id;
  return { pass: !r.error && r.data?.org_id === ORG_A, detail: `${errMsg(r)} org stamped=${r.data?.org_id === ORG_A}` };
});
await test("evidence", "retried photo upload (same backend_ref) does not duplicate", async () => {
  const r = await c.aDriver.from("photos").upsert(photoRow(), { onConflict: "backend_ref" }).select("id").single();
  const n = await c.aAdmin.from("photos").select("id").eq("backend_ref", backendRef);
  return { pass: n.data?.length === 1, detail: `${errMsg(r)} rows=${n.data?.length}` };
});
await test("evidence", "other org cannot read or attach evidence to this job", async () => {
  const s = await c.bAdmin.from("photos").select("id").eq("job_id", JOB);
  const i = await c.bDriver.from("photos").insert({ ...photoRow(), backend_ref: backendRef + "-x" }).select("id");
  return { pass: denied(s) && !!i.error, detail: `read=${s.data?.length ?? errMsg(s)} insert=${errMsg(i)}` };
});
await test("evidence", "evidence cannot be deleted by the driver (write lockdown)", async () => {
  const d = await c.aDriver.from("photos").delete().eq("id", photoId).select("id");
  const n = await c.aAdmin.from("photos").select("id").eq("id", photoId);
  return { pass: n.data?.length === 1, detail: `${errMsg(d)} still present=${n.data?.length === 1}` };
});

// ---------- DELIVERY → POD ----------
await test("inspection", "delivery inspection moves job to pod_ready", async () => {
  const r = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "delivery", p_inspection: { odometer: 12410, fuel_level_percent: 55, customer_name: "ZZ Receiver", damage_declaration: "none_found" }, p_damage_items: [], p_submission_session_id: randomUUID() });
  const j = await c.aAdmin.from("jobs").select("status,has_delivery_inspection").eq("id", JOB).single();
  return { pass: !r.error && r.data?.toStatus === "pod_ready" && j.data?.status === "pod_ready", detail: `${errMsg(r)} toStatus=${r.data?.toStatus} job=${j.data?.status}` };
});
const podPath = `${ORG_A}/POD-${reg}-${RUN}.pdf`;
const podBytes = Buffer.from(`%PDF-1.4\n% ZZ staging regression POD ${RUN}\n%%EOF\n`);
let signedUrl = null;
await test("pod", "admin stores the POD PDF in the org's private folder and gets a working signed link", async () => {
  const u = await c.aAdmin.storage.from("pod-pdfs").upload(podPath, podBytes, { contentType: "application/pdf", upsert: true });
  if (u.error) return { pass: false, detail: "upload " + u.error.message };
  const s = await c.aAdmin.storage.from("pod-pdfs").createSignedUrl(podPath, 600);
  signedUrl = s.data?.signedUrl;
  const got = signedUrl ? Buffer.from(await (await fetch(signedUrl)).arrayBuffer()) : Buffer.alloc(0);
  const same = createHash("sha256").update(got).digest("hex") === createHash("sha256").update(podBytes).digest("hex");
  return { pass: !!signedUrl && same, detail: `signed=${!!signedUrl} bytesMatch=${same}` };
});
await test("pod", "POD file is private: anon, other org and driver (pod.view off) cannot read it", async () => {
  const pub = await fetch(`${URL}/storage/v1/object/public/pod-pdfs/${podPath}`);
  const b = await c.bAdmin.storage.from("pod-pdfs").download(podPath);
  const d = await c.aDriver.storage.from("pod-pdfs").download(podPath);
  const bs = await c.bAdmin.storage.from("pod-pdfs").createSignedUrl(podPath, 60);
  return { pass: pub.status >= 400 && !!b.error && !!d.error && !bs.data?.signedUrl, detail: `public=${pub.status} orgB=${!!b.error} driver=${!!d.error} orgBsign=${!!bs.data?.signedUrl}` };
});
await test("pod", "other org cannot write into this org's POD folder", async () => {
  const u = await c.bAdmin.storage.from("pod-pdfs").upload(`${ORG_A}/ZZ-intrusion-${RUN}.pdf`, podBytes, { contentType: "application/pdf" });
  return { pass: !!u.error, detail: u.error?.message || "upload succeeded" };
});
await test("pod", "POD e-mail to a real customer address sends nothing from staging", async () => {
  const r = await fn("send-pod-email", "aAdmin", { to: "customer@example.com", jobId: JOB, downloadUrl: signedUrl });
  // EMAIL_SUPPRESSED = the deployed staging delivery guard stopped it (a provider
  // key IS configured). EMAIL_NOT_CONFIGURED = no key, so the guard was not reached.
  const blocked = r.status !== 200 && ["EMAIL_SUPPRESSED", "EMAIL_NOT_CONFIGURED"].includes(r.json?.error);
  const via = r.json?.error === "EMAIL_SUPPRESSED" ? "deployed delivery guard" : "no provider key";
  return { pass: blocked, detail: `${r.status} ${r.json?.error} — blocked by ${via}` };
});

// ---------- COMPLETION / REOPEN ----------
await test("completion", "driver cannot complete a job", async () => {
  const r = await c.aDriver.rpc("complete_job", { p_job_id: JOB, p_notes: "x" });
  return { pass: !!r.error, detail: errMsg(r) };
});
await test("completion", "admin completes job from pod_ready", async () => {
  const r = await c.aAdmin.rpc("complete_job", { p_job_id: JOB, p_notes: "workflow regression" });
  const j = await c.aAdmin.from("jobs").select("status,completed_at").eq("id", JOB).single();
  return { pass: !r.error && j.data?.status === "completed" && !!j.data?.completed_at, detail: `${errMsg(r)} status=${j.data?.status}` };
});
await test("completion", "completed job is locked against new inspections", async () => {
  const r = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "delivery", p_inspection: { odometer: 1 }, p_damage_items: [], p_submission_session_id: randomUUID() });
  return { pass: !!r.error, detail: errMsg(r) };
});
await test("completion", "other-org admin cannot reopen", async () => {
  const r = await c.bAdmin.rpc("reopen_job", { p_job_id: JOB, p_notes: "x" });
  const j = await c.aAdmin.from("jobs").select("status").eq("id", JOB).single();
  return { pass: !!r.error && j.data?.status === "completed", detail: `${errMsg(r)} status=${j.data?.status}` };
});
await test("completion", "admin reopens: new run, ready_for_pickup, pickup can be redone", async () => {
  const r = await c.aAdmin.rpc("reopen_job", { p_job_id: JOB, p_notes: "workflow regression reopen" });
  const j = await c.aAdmin.from("jobs").select("status,current_run_id,has_pickup_inspection").eq("id", JOB).single();
  const again = await c.aDriver.rpc("submit_inspection", { p_job_id: JOB, p_type: "pickup", p_inspection: { odometer: 12500, damage_declaration: "none_found" }, p_damage_items: [], p_submission_session_id: randomUUID() });
  const newRun = j.data?.current_run_id && j.data.current_run_id !== created.data.current_run_id;
  return { pass: !r.error && j.data?.status === "ready_for_pickup" && newRun && !again.error, detail: `${errMsg(r)} status=${j.data?.status} newRun=${!!newRun} repickup=${errMsg(again)}` };
});
await test("completion", "activity log records the lifecycle", async () => {
  const l = await c.aAdmin.from("job_activity_log").select("action,to_status").eq("job_id", JOB);
  const to = (l.data || []).map((x) => x.to_status);
  const need = ["pickup_complete", "pod_ready", "completed", "ready_for_pickup"];
  return { pass: need.every((s) => to.includes(s)), detail: `${errMsg(l)} to_status=${to}` };
});

const counts = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
for (const r of results) console.log(`${r.status.padEnd(13)} [${r.category}] ${r.name} — ${r.detail}`);
console.log("\nSUMMARY", JSON.stringify(counts), "run", RUN, "job", JOB);
const j = process.argv.indexOf("--json");
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify({ run: RUN, job: JOB, target: URL, results }, null, 2));
process.exit(results.some((r) => r.status !== "VERIFIED PASS") ? 1 : 0);
