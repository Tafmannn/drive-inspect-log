import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Google Auth via Service Account ─────────────────────────────────

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const b64url = (str: string) =>
    str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = b64url(btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claimB64 = b64url(
    btoa(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    )
  );

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const input = `${headerB64}.${claimB64}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input)
  );
  const sigB64 = b64url(btoa(String.fromCharCode(...new Uint8Array(sig))));
  const fullJwt = `${headerB64}.${claimB64}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${fullJwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// ─── Sheets API helpers ──────────────────────────────────────────────

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function getSheetNames(token: string, spreadsheetId: string): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get sheet metadata [${res.status}]: ${err}`);
  }
  const data = await res.json();
  return (data.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean);
}

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input;
}

async function readSheet(
  token: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  // Use encodeURI (not encodeURIComponent) to preserve !, :, and ' characters
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURI(range)}`;
  console.log("Reading sheet range:", range);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets read failed [${res.status}]: ${err}`);
  }
  const data = await res.json();
  return data.values ?? [];
}

async function updateCell(
  token: string,
  spreadsheetId: string,
  range: string,
  value: string
): Promise<void> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURI(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets update failed [${res.status}]: ${err}`);
  }
}

// ─── Expected headers for Job Master ─────────────────────────────────

const EXPECTED_HEADERS = [
  "Job ID", "Job Date", "Job Status", "Job Priority", "Job Type", "Job Source", "Created At", "Updated At",
  "Client Name", "Client Notes",
  "Pickup Contact Name", "Pickup Contact Phone", "Pickup Address Line 1", "Pickup Town / City", "Pickup Postcode",
  "Pickup Time From", "Pickup Time To", "Pickup Access Notes",
  "Delivery Contact Name", "Delivery Contact Phone", "Delivery Address Line 1", "Delivery Town / City",
  "Delivery Postcode", "Delivery Time From", "Delivery Time To", "Delivery Access Notes", "Promise By Time",
  "Vehicle Reg", "Vehicle Make", "Vehicle Model", "Vehicle Colour", "Vehicle Type", "Vehicle Fuel Type",
  "Distance (Miles)", "Rate (£ per mile)", "Total Price (£)", "CAZ/ULEZ?", "CAZ/ULEZ Cost (£)", "Other Expenses (£)",
  "Driver Name", "Driver ID", "Job Notes", "Cancellation Reason", "Sync to App?", "App Job ID", "Sync to Map?", "Map Job ID"
];

// Required fields for job creation (header names)
const REQUIRED_FIELDS = [
  "Job Date", "Job Status", "Job Type", "Client Name",
  "Pickup Contact Name", "Pickup Contact Phone", "Pickup Address Line 1", "Pickup Town / City", "Pickup Postcode",
  "Delivery Contact Name", "Delivery Contact Phone", "Delivery Address Line 1", "Delivery Town / City", "Delivery Postcode",
  "Vehicle Reg", "Distance (Miles)", "Rate (£ per mile)", "Total Price (£)"
];

// ─── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SA_JSON_STR = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    if (!SA_JSON_STR) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const serviceAccount = JSON.parse(SA_JSON_STR);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action } = await req.json();

    // Get sync config
    const { data: config, error: cfgErr } = await supabase
      .from("sheet_sync_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    if (!config) {
      return respond({ error: "Google Sheet not configured. Please set up the connection in Admin settings." }, 400);
    }
    if (!config.is_enabled) {
      return respond({ error: "Sheet sync is currently disabled." }, 400);
    }

    const token = await getAccessToken(serviceAccount);
    const spreadsheet_id = extractSpreadsheetId(config.spreadsheet_id);
    const sheetName = config.sheet_name || "Job Master";

    if (action === "test") {
      // First get available sheet names
      const sheetNames = await getSheetNames(token, spreadsheet_id);
      console.log("Available sheets:", sheetNames);
      
      if (!sheetNames.includes(sheetName)) {
        return respond({ 
          success: false, 
          error: `Tab "${sheetName}" not found. Available tabs: ${sheetNames.join(", ")}`,
          available_sheets: sheetNames 
        }, 400);
      }
      
      const rows = await readSheet(token, spreadsheet_id, `'${sheetName}'!A1:AZ1`);
      const headers = rows[0] ?? [];
      // Validate headers
      const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        return respond({ success: false, error: `Missing headers: ${missing.join(", ")}`, headers }, 400);
      }
      return respond({ success: true, headers, message: "All headers validated successfully." });
    } else if (action === "pull") {
      return await handlePull(supabase, token, spreadsheet_id, sheetName);
    } else {
      return respond({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    console.error("Sheet sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return respond({ error: msg }, 500);
  }
});

// ─── PULL: Job Master → App (Create new jobs) ───────────────────────

async function handlePull(
  supabase: any,
  token: string,
  spreadsheetId: string,
  sheetName: string
) {
  const log = { rows_processed: 0, rows_created: 0, rows_updated: 0, rows_skipped: 0, errors: [] as any[] };

  try {
    // Read all data dynamically
    const rows = await readSheet(token, spreadsheetId, `'${sheetName}'!A:AZ`);
    if (rows.length < 2) {
      return respond({ success: true, message: "Sheet is empty.", ...log });
    }

    const headers = rows[0];
    // Validate headers
    const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h));
    if (missing.length > 0) {
      return respond({ success: false, error: `Missing headers in Job Master: ${missing.join(", ")}`, ...log }, 400);
    }

    // Build header → index map
    const hIdx: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      hIdx[headers[i].trim()] = i;
    }

    const cell = (row: string[], header: string): string => {
      const idx = hIdx[header];
      if (idx === undefined) return "";
      return (row[idx] ?? "").trim();
    };

    const norm = (val: string): string => val.toUpperCase().trim();

    // Clear old unresolved sync errors
    await supabase.from("sync_errors").delete().eq("resolved", false);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c || c.trim() === "")) continue;

      log.rows_processed++;
      const sheetRowIndex = i + 1; // 1-indexed for sheet

      const syncToApp = norm(cell(row, "Sync to App?"));
      const appJobId = cell(row, "App Job ID");
      const sheetJobId = cell(row, "Job ID");

      // Skip rows not marked for sync
      if (syncToApp !== "YES") {
        log.rows_skipped++;
        continue;
      }

      // Skip rows already synced (idempotency)
      if (appJobId) {
        log.rows_skipped++;
        continue;
      }

      // Validate required fields
      const missingFields: string[] = [];
      for (const reqField of REQUIRED_FIELDS) {
        if (!cell(row, reqField)) {
          missingFields.push(reqField);
        }
      }

      if (missingFields.length > 0) {
        // Log validation error
        await supabase.from("sync_errors").insert({
          sheet_row_index: sheetRowIndex,
          sheet_job_id: sheetJobId || null,
          missing_fields: missingFields,
          error_message: `Missing required fields: ${missingFields.join(", ")}`,
        });
        log.errors.push({ row: sheetRowIndex, sheetJobId, missing: missingFields });
        log.rows_skipped++;
        continue;
      }

      // Also check for duplicate sheet_job_id in DB
      if (sheetJobId) {
        const { data: existing } = await supabase
          .from("jobs")
          .select("id")
          .eq("sheet_job_id", sheetJobId)
          .maybeSingle();
        if (existing) {
          // Already exists — write back app ID and skip
          const appIdColLetter = getColumnLetter(hIdx["App Job ID"]);
          await updateCell(token, spreadsheetId, `'${sheetName}'!${appIdColLetter}${sheetRowIndex}`, existing.id);
          log.rows_skipped++;
          continue;
        }
      }

      // Parse numeric values
      const parseNum = (val: string): number | null => {
        if (!val) return null;
        const n = parseFloat(val.replace(/[£,]/g, ""));
        return isNaN(n) ? null : n;
      };

      // Map status from sheet to app
      const statusMap: Record<string, string> = {
        "draft": "ready_for_pickup",
        "booked": "ready_for_pickup",
        "enroute": "in_transit",
        "en route": "in_transit",
        "completed": "delivery_complete",
        "cancelled": "cancelled",
      };
      const rawStatus = cell(row, "Job Status").toLowerCase();
      const appStatus = statusMap[rawStatus] || "ready_for_pickup";

      // Build job insert payload
      const jobPayload: Record<string, any> = {
        sheet_job_id: sheetJobId || null,
        external_job_number: sheetJobId || null,
        job_date: cell(row, "Job Date") || null,
        status: appStatus,
        priority: cell(row, "Job Priority") || "Normal",
        job_type: cell(row, "Job Type") || "Single",
        job_source: cell(row, "Job Source") || null,
        client_name: cell(row, "Client Name") || null,
        client_notes: cell(row, "Client Notes") || null,
        pickup_contact_name: cell(row, "Pickup Contact Name"),
        pickup_contact_phone: cell(row, "Pickup Contact Phone"),
        pickup_address_line1: cell(row, "Pickup Address Line 1"),
        pickup_city: cell(row, "Pickup Town / City"),
        pickup_postcode: cell(row, "Pickup Postcode"),
        pickup_time_from: cell(row, "Pickup Time From") || null,
        pickup_time_to: cell(row, "Pickup Time To") || null,
        pickup_access_notes: cell(row, "Pickup Access Notes") || null,
        delivery_contact_name: cell(row, "Delivery Contact Name"),
        delivery_contact_phone: cell(row, "Delivery Contact Phone"),
        delivery_address_line1: cell(row, "Delivery Address Line 1"),
        delivery_city: cell(row, "Delivery Town / City"),
        delivery_postcode: cell(row, "Delivery Postcode"),
        delivery_time_from: cell(row, "Delivery Time From") || null,
        delivery_time_to: cell(row, "Delivery Time To") || null,
        delivery_access_notes: cell(row, "Delivery Access Notes") || null,
        promise_by_time: cell(row, "Promise By Time") || null,
        vehicle_reg: cell(row, "Vehicle Reg"),
        vehicle_make: cell(row, "Vehicle Make") || "",
        vehicle_model: cell(row, "Vehicle Model") || "",
        vehicle_colour: cell(row, "Vehicle Colour") || "",
        vehicle_type: cell(row, "Vehicle Type") || null,
        vehicle_fuel_type: cell(row, "Vehicle Fuel Type") || null,
        distance_miles: parseNum(cell(row, "Distance (Miles)")),
        rate_per_mile: parseNum(cell(row, "Rate (£ per mile)")),
        total_price: parseNum(cell(row, "Total Price (£)")),
        caz_ulez_flag: cell(row, "CAZ/ULEZ?") || null,
        caz_ulez_cost: parseNum(cell(row, "CAZ/ULEZ Cost (£)")),
        other_expenses: parseNum(cell(row, "Other Expenses (£)")),
        driver_name: cell(row, "Driver Name") || null,
        driver_external_id: cell(row, "Driver ID") || null,
        job_notes: cell(row, "Job Notes") || null,
        cancellation_reason: cell(row, "Cancellation Reason") || null,
        sync_to_map: norm(cell(row, "Sync to Map?")) === "YES",
        sheet_row_index: sheetRowIndex,
      };

      // Insert job
      const { data: newJob, error: insertErr } = await supabase
        .from("jobs")
        .insert(jobPayload)
        .select("id")
        .single();

      if (insertErr) {
        log.errors.push({ row: sheetRowIndex, sheetJobId, error: insertErr.message });
        continue;
      }

      // Write back App Job ID to sheet
      const appIdColLetter = getColumnLetter(hIdx["App Job ID"]);
      await updateCell(token, spreadsheetId, `'${sheetName}'!${appIdColLetter}${sheetRowIndex}`, newJob.id);

      log.rows_created++;
    }

    // Update last_pull_at
    const { data: cfgId } = await supabase.from("sheet_sync_config").select("id").single();
    if (cfgId) {
      await supabase.from("sheet_sync_config").update({ last_pull_at: new Date().toISOString() }).eq("id", cfgId.id);
    }

    // Log sync
    await supabase.from("sheet_sync_logs").insert({
      direction: "pull",
      status: log.errors.length ? "partial" : "success",
      ...log,
    });

    return respond({ success: true, ...log });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.errors.push({ error: msg });
    await supabase.from("sheet_sync_logs").insert({
      direction: "pull",
      status: "error",
      ...log,
    });
    return respond({ success: false, error: msg, ...log }, 500);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getColumnLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

function respond(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
