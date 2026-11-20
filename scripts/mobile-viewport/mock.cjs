// Fixture backend: every request to the fake Supabase host is answered here.
// Nothing reaches staging or production.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const statuses = ["assigned", "ready_for_pickup", "pickup_complete", "in_transit"];
function job(i) {
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  return {
    id,
    external_job_number: i === 7 ? "MVX-2026-11-20-LONGREFERENCE-0000000007-REBOOKED" : `AX-${1000 + i}`,
    job_number: `AX-${1000 + i}`,
    sheet_job_id: null,
    job_date: new Date(Date.now() + i * 3600e3).toISOString().slice(0, 10),
    priority: "normal",
    job_type: "single",
    job_source: "direct",
    client_name: "Fixture Client Ltd",
    client_notes: null, client_phone: "01234 567890", client_email: null, client_company: "Fixture Client Ltd",
    vehicle_reg: `AB${String(i).padStart(2, "0")} CDE`,
    vehicle_make: "Volkswagen", vehicle_model: "Golf", vehicle_colour: "Grey", vehicle_year: "2021",
    vehicle_type: "car", vehicle_fuel_type: "petrol",
    pickup_contact_name: "Pat Pickup", pickup_contact_phone: "07700 900001", pickup_contact_email: null,
    pickup_company: "Northern Dealer Group",
    pickup_address_line1: i === 7
      ? "Unit 14B, The Very Long Industrial Estate Name Business Park, Off Supercalifragilisticexpialidocious Road"
      : `${i} High Street`,
    pickup_address_line2: null, pickup_city: "Manchester", pickup_postcode: "M1 1AA",
    pickup_notes: null, pickup_time_from: null, pickup_time_to: null, pickup_access_notes: null,
    delivery_contact_name: "Dee Delivery", delivery_contact_phone: "07700 900002", delivery_contact_email: null,
    delivery_company: null,
    delivery_address_line1: `${i} Station Road`, delivery_address_line2: null,
    delivery_city: "Leeds", delivery_postcode: "LS1 1AA",
    delivery_notes: null, delivery_time_from: null, delivery_time_to: null, delivery_access_notes: null,
    promise_by_time: null, earliest_delivery_date: null,
    distance_miles: 45, rate_per_mile: 1.2, total_price: 120,
    caz_ulez_flag: null, caz_ulez_cost: null, other_expenses: null,
    driver_id: "driver-profile-1", driver_name: "Driver", driver_external_id: null,
    job_notes: null, cancellation_reason: null, sync_to_map: false, sheet_row_index: null,
    status: i === 1 ? "ready_for_pickup" : statuses[i % statuses.length],
    has_pickup_inspection: false, has_delivery_inspection: false,
    completed_at: null,
    created_at: new Date(Date.now() - i * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    is_hidden: false, current_run_id: null, org_id: "org-1",
    driver_profiles: { display_name: "Driver", full_name: "Fixture Driver" },
  };
}
const FAKE_USER = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "client@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function fakeSession() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const token = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: FAKE_USER.id, exp, role: "authenticated", email: FAKE_USER.email }) + ".sig";
  return { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "fake-refresh", user: FAKE_USER };
}
const JOBS = Array.from({ length: 25 }, (_, i) => job(i + 1));

async function setup(context) {
  await context.route(/fake-supabase\.test/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const accept = (req.headers()["accept"] || "");
    const wantsObject = accept.includes("vnd.pgrst.object");
    const json = (body, headers = {}) =>
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "content-range", ...headers }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });

    if (url.pathname.startsWith("/auth/v1/user")) return json(FAKE_USER);
    if (url.pathname.startsWith("/auth/v1/")) return json({});
    if (url.pathname.startsWith("/functions/v1/portal-evidence")) {
      return json({ photos: Array.from({ length: 6 }, (_, i) => ({ id: "p" + i, type: "front", label: "Photo " + (i + 1), inspection_type: i < 3 ? "pickup" : "delivery", url: "http://fake-supabase.test/storage/v1/p" + i + ".png" })), signatures: [], unavailable: 0 });
    }
    if (url.pathname.startsWith("/storage/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG, headers: { "access-control-allow-origin": "*" } });
    }
    const m = url.pathname.match(/^\/rest\/v1\/([^/]+)/);
    if (!m) return json({});
    const table = m[1];
    const q = url.searchParams;
    if (table === "rpc") {
      const fn = url.pathname.split("/").pop();
      const pj = (j) => ({ id: j.id, job_ref: j.external_job_number, vehicle_reg: j.vehicle_reg, vehicle_make: j.vehicle_make, vehicle_model: j.vehicle_model, vehicle_colour: j.vehicle_colour, pickup_city: j.pickup_city, pickup_postcode: j.pickup_postcode, delivery_city: j.delivery_city, delivery_postcode: j.delivery_postcode, job_date: j.job_date, status: j.status, created_at: j.created_at, completed_at: null });
      if (fn === "portal_context") return json({ client: { id: "c1", name: "Fixture Client Ltd with a rather long trading name" }, operator: { name: "Axentra Vehicles", logo_url: null, primary_colour: "#1E4FA8", contact_email: "ops@example.test", contact_phone: "01234 567890" } });
      if (fn === "portal_list_jobs") return json(JOBS.map(pj));
      if (fn === "portal_list_invoices") return json([]);
      if (fn === "portal_get_job") {
        const body = JSON.parse(req.postData() || "{}"); const j = JOBS.find((x) => x.id === body.p_job_id) || JOBS[6];
        return json({ job: { ...pj(j), vehicle_year: "2021", pickup_address_line1: j.pickup_address_line1, pickup_address_line2: null, pickup_contact_name: "Pat", delivery_address_line1: j.delivery_address_line1, delivery_address_line2: null, delivery_contact_name: "Dee", earliest_delivery_date: null }, timeline: [{ status: "assigned", at: j.created_at }], inspections: [{ type: "pickup", inspected_at: j.created_at, odometer: 12345, fuel_level_percent: 50, number_of_keys: "2", customer_name: "Pat", inspected_by_name: "Driver", notes: "Light scuff nearside rear", damage: [] }] });
      }
      return json(null);
    }

    let rows = [];
    if (table === "jobs") {
      rows = JOBS;
      const idEq = q.get("id");
      if (idEq && idEq.startsWith("eq.")) rows = JOBS.filter((j) => j.id === idEq.slice(3));
      const st = q.get("status");
      if (st && st.startsWith("in.")) {
        const set = st.slice(4, -1).split(",").map((s) => s.replace(/"/g, ""));
        rows = rows.filter((j) => set.includes(j.status));
      } else if (st && st.startsWith("eq.")) rows = rows.filter((j) => j.status === st.slice(3));
    } else if (table === "user_profiles") {
      rows = [{ account_status: "active", role: process.env.MOCK_ROLE || "client" }];
    } else if (table === "driver_profiles") {
      rows = [{ id: "driver-profile-1", user_id: "default-driver", display_name: "Driver", full_name: "Fixture Driver" }];
    } else if (table === "driver_onboarding") {
      rows = [{ status: "approved" }];
    }
    const range = { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { ...range, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" } });
    if (wantsObject) {
      if (rows.length === 0) return route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "0 rows" }), headers: { "access-control-allow-origin": "*" } });
      return json(rows[0], range);
    }
    return json(rows, range);
  });
}

// Signed-in client session for the auth-enabled server (port 8081).
async function signIn(context) {
  const sess = fakeSession();
  await context.addInitScript((v) => { try { localStorage.setItem("sb-fake-supabase-auth-token", v); } catch {} }, JSON.stringify(sess));
}
module.exports = { setup, JOBS, signIn };
