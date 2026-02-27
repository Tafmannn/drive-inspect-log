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

// ─── Expected headers for Jobs tab ───────────────────────────────────

const EXPECTED_HEADERS = [
  "Date", "Client", "Reg", "Start PC", "End PC", "Miles", "Rate",
  "Expenses", "Total", "Status", "Invoice Link", "Job ID", "Alerts", "Bid Phrase"
];

// Required fields for job creation (header names)
const REQUIRED_FIELDS = [
  "Reg", "Start PC", "End PC", "Job ID"
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
      const headers = (rows[0] ?? []).map((h: string) => h.trim());
      // Validate headers (trim both sides for comparison)
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

    const headers = rows[0].map((h: string) => h.trim());
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

      const sheetJobId = cell(row, "Job ID");

      // Skip rows without a Job ID (anchor column)
      if (!sheetJobId) {
        log.rows_skipped++;
        continue;
      }

      // Check if job already exists in DB by sheet_job_id or external_job_number
      const { data: existing } = await supabase
        .from("jobs")
        .select("id")
        .or(`sheet_job_id.eq.${sheetJobId},external_job_number.eq.${sheetJobId}`)
        .maybeSingle();

      if (existing) {
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
        "pending": "ready_for_pickup",
      };
      const rawStatus = (cell(row, "Status") || "").toLowerCase();
      const appStatus = statusMap[rawStatus] || "ready_for_pickup";

      // Build job insert payload mapped from 14-column "Jobs" tab
      const jobPayload: Record<string, any> = {
        sheet_job_id: sheetJobId,
        external_job_number: sheetJobId,
        status: appStatus,
        vehicle_reg: cell(row, "Reg") || "UNKNOWN",
        vehicle_make: "",
        vehicle_model: "",
        vehicle_colour: "",
        pickup_contact_name: cell(row, "Client") || "Unknown",
        pickup_contact_phone: "",
        pickup_address_line1: cell(row, "Start PC") || "",
        pickup_city: "",
        pickup_postcode: cell(row, "Start PC") || "",
        delivery_contact_name: cell(row, "Client") || "Unknown",
        delivery_contact_phone: "",
        delivery_address_line1: cell(row, "End PC") || "",
        delivery_city: "",
        delivery_postcode: cell(row, "End PC") || "",
        client_name: cell(row, "Client") || null,
        distance_miles: parseNum(cell(row, "Miles")),
        rate_per_mile: parseNum(cell(row, "Rate")),
        other_expenses: parseNum(cell(row, "Expenses")),
        total_price: parseNum(cell(row, "Total")),
        job_date: cell(row, "Date") || null,
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
