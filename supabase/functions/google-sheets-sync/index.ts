import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://id-preview--3a41afcd-01f5-4632-9ca9-6cdb511c4f9c.lovable.app",
  "https://axentra.lovable.app",
];

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
}

// Dynamic corsHeaders set per-request
let corsHeaders: Record<string, string> = cors(null);

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

async function updateRow(
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[]
): Promise<void> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURI(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Row update failed [${res.status}]: ${err}`);
  }
}

async function addSheet(
  token: string,
  spreadsheetId: string,
  title: string
): Promise<void> {
  const url = `${SHEETS_API}/${spreadsheetId}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Add sheet failed [${res.status}]: ${err}`);
  }
}

async function appendRow(
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[]
): Promise<void> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURI(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Append row failed [${res.status}]: ${err}`);
  }
}

// ─── Full 45-column Job Master headers (canonical order) ────────────

const JOB_MASTER_HEADERS = [
  "Job ID", "Job Date", "Job Status", "Job Priority", "Job Type", "Job Source",
  "Created At", "Updated At", "Client Name", "Client Notes",
  "Pickup Contact Name", "Pickup Contact Phone", "Pickup Address Line 1", "Pickup Town / City", "Pickup Postcode",
  "Pickup Time From", "Pickup Time To", "Pickup Access Notes",
  "Delivery Contact Name", "Delivery Contact Phone", "Delivery Address Line 1", "Delivery Town / City", "Delivery Postcode",
  "Delivery Time From", "Delivery Time To", "Delivery Access Notes", "Promise By Time",
  "Vehicle Reg", "Vehicle Make", "Vehicle Model", "Vehicle Colour", "Vehicle Type", "Vehicle Fuel Type",
  "Distance (Miles)", "Rate (£ per mile)", "Total Price (£)", "CAZ/ULEZ?", "CAZ/ULEZ Cost (£)", "Other Expenses (£)",
  "Driver Name", "Driver ID", "Job Notes", "Cancellation Reason",
  "Sync to App?", "App Job ID", "Sync to Map?", "Map Job ID",
];

// ─── Job Entry column → app field mapping ────────────────────────────
// This is the configurable mapping from Job Entry tab headers to app job fields.
// Adjust this if the Job Entry tab headers differ.

const JOB_ENTRY_HEADER_MAP: Record<string, string> = {
  // Flexible: maps common Job Entry header names → app job field names
  "Job ID": "external_job_number",
  "Job Number": "external_job_number",
  "Job Date": "job_date",
  "Date": "job_date",
  "Job Status": "_status_raw",
  "Status": "_status_raw",
  "Job Priority": "priority",
  "Priority": "priority",
  "Job Type": "job_type",
  "Type": "job_type",
  "Job Source": "job_source",
  "Source": "job_source",
  "Client Name": "client_name",
  "Client": "client_name",
  "Customer": "client_name",
  "Client Notes": "client_notes",
  "Client Phone": "client_phone",
  "Client Email": "client_email",
  "Client Company": "client_company",
  "Pickup Contact Name": "pickup_contact_name",
  "Pickup Name": "pickup_contact_name",
  "Pickup Contact Phone": "pickup_contact_phone",
  "Pickup Phone": "pickup_contact_phone",
  "Pickup Company": "pickup_company",
  "Pickup Address Line 1": "pickup_address_line1",
  "Pickup Address": "pickup_address_line1",
  "Pickup Town / City": "pickup_city",
  "Pickup City": "pickup_city",
  "Pickup Postcode": "pickup_postcode",
  "Start PC": "pickup_postcode",
  "Pickup Time From": "pickup_time_from",
  "Pickup Time To": "pickup_time_to",
  "Pickup Access Notes": "pickup_access_notes",
  "Pickup Notes": "pickup_notes",
  "Delivery Contact Name": "delivery_contact_name",
  "Delivery Name": "delivery_contact_name",
  "Delivery Contact Phone": "delivery_contact_phone",
  "Delivery Contact Pho": "delivery_contact_phone",
  "Delivery Phone": "delivery_contact_phone",
  "Delivery Company": "delivery_company",
  "Delivery Address Line 1": "delivery_address_line1",
  "Delivery Address": "delivery_address_line1",
  "Delivery Town / City": "delivery_city",
  "Delivery City": "delivery_city",
  "Delivery Postcode": "delivery_postcode",
  "End PC": "delivery_postcode",
  "Delivery Time From": "delivery_time_from",
  "Delivery Time Fr": "delivery_time_from",
  "Delivery Time To": "delivery_time_to",
  "Delivery Access Notes": "delivery_access_notes",
  "Promise By Time": "promise_by_time",
  "Vehicle Reg": "vehicle_reg",
  "Reg": "vehicle_reg",
  "Registration": "vehicle_reg",
  "Vehicle Make": "vehicle_make",
  "Make": "vehicle_make",
  "Vehicle Model": "vehicle_model",
  "Model": "vehicle_model",
  "Vehicle Colour": "vehicle_colour",
  "Colour": "vehicle_colour",
  "Color": "vehicle_colour",
  "Vehicle Type": "vehicle_type",
  "Vehicle Fuel Type": "vehicle_fuel_type",
  "Fuel Type": "vehicle_fuel_type",
  "Distance (Miles)": "distance_miles",
  "Miles": "distance_miles",
  "Rate (£ per mile)": "rate_per_mile",
  "Rate": "rate_per_mile",
  "Total Price (£)": "total_price",
  "Total": "total_price",
  "CAZ/ULEZ?": "caz_ulez_flag",
  "CAZ/ULEZ Cost (£)": "caz_ulez_cost",
  "Other Expenses (£)": "other_expenses",
  "Expenses": "other_expenses",
  "Driver Name": "driver_name",
  "Driver": "driver_name",
  "Driver ID": "driver_external_id",
  "Job Notes": "job_notes",
  "Notes": "job_notes",
  "Cancellation Reason": "cancellation_reason",
  // These are write-back columns on Job Entry
  "App Job ID": "_app_job_id",
  "Imported At": "_imported_at",
  "Import?": "_import_flag",
  "Sync to App?": "_import_flag",
};

// Minimum required fields to create a job (only these 4 block import)
const JOB_ENTRY_REQUIRED_FIELDS = [
  "client_name",
  "pickup_postcode",
  "delivery_postcode",
  "vehicle_reg",
];

// ─── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  corsHeaders = cors(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── Auth (admin-only) ───
    const authHeader = req.headers.get("Authorization") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(SUPABASE_URL, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userOrgId = authData.user.user_metadata?.org_id ?? null;
    const role = authData.user.user_metadata?.role ?? null;
    if (!userOrgId) {
      return new Response(JSON.stringify({ error: "NO_ORG" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role !== "admin") {
      return new Response(JSON.stringify({ error: "ADMIN_ONLY" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Original logic ───
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SA_JSON_STR = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    if (!SA_JSON_STR) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const serviceAccount = JSON.parse(SA_JSON_STR);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action } = body;

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

    if (action === "setup_job_master") {
      const sheetNames = await getSheetNames(token, spreadsheet_id);
      if (sheetNames.includes("Job Master")) {
        const { data: cfgId } = await supabase.from("sheet_sync_config").select("id").single();
        if (cfgId) {
          await supabase.from("sheet_sync_config").update({ sheet_name: "Job Master" }).eq("id", cfgId.id);
        }
        return respond({ success: true, message: "Tab 'Job Master' already exists. Config updated.", headers: JOB_MASTER_HEADERS });
      }
      await addSheet(token, spreadsheet_id, "Job Master");
      const colLetter = getColumnLetter(JOB_MASTER_HEADERS.length - 1);
      await appendRow(token, spreadsheet_id, `'Job Master'!A1:${colLetter}1`, JOB_MASTER_HEADERS);
      const { data: cfgId } = await supabase.from("sheet_sync_config").select("id").single();
      if (cfgId) {
        await supabase.from("sheet_sync_config").update({ sheet_name: "Job Master" }).eq("id", cfgId.id);
      }
      return respond({ success: true, message: "Created 'Job Master' tab with 47 headers and updated config.", headers: JOB_MASTER_HEADERS });
    } else if (action === "test") {
      const sheetNames = await getSheetNames(token, spreadsheet_id);
      console.log("Available sheets:", sheetNames);
      
      // Find Job Entry tab
      const jobEntryTab = findTabName(sheetNames, "Job Entry");
      const jobMasterTab = findTabName(sheetNames, "Job Master");
      
      // Test configured sheet
      if (!sheetNames.includes(sheetName)) {
        return respond({ 
          success: false, 
          error: `Tab "${sheetName}" not found. Available tabs: ${sheetNames.join(", ")}`,
          available_sheets: sheetNames 
        }, 400);
      }
      
      const rows = await readSheet(token, spreadsheet_id, `'${sheetName}'!A1:AZ1`);
      const headers = (rows[0] ?? []).map((h: string) => h.trim());
      
      // Only validate Job Master headers if testing Job Master
      if (sheetName === "Job Master" || sheetName === jobMasterTab) {
        // Only check critical headers, not all — sheet may have extra/reordered columns
        const criticalHeaders = ["App Job ID", "Job Status", "Vehicle Reg", "Pickup Address Line 1", "Delivery Address Line 1"];
        const missing = criticalHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) {
          return respond({ success: false, error: `Missing critical headers: ${missing.join(", ")}`, headers }, 400);
        }
      }
      
      return respond({ 
        success: true, 
        headers, 
        message: "All headers validated successfully.",
        available_sheets: sheetNames,
        job_entry_tab: jobEntryTab,
        job_master_tab: jobMasterTab,
      });
    } else if (action === "pull") {
      return await handlePull(supabase, token, spreadsheet_id);
    } else if (action === "push") {
      const { jobIds } = body;
      return await handlePush(supabase, token, spreadsheet_id, sheetName, jobIds);
    } else {
      return respond({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    console.error("Sheet sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return respond({ error: msg }, 500);
  }
});

// ─── Find closest matching tab name ──────────────────────────────────

function findTabName(sheetNames: string[], target: string): string | null {
  // Exact match first
  if (sheetNames.includes(target)) return target;
  // Case-insensitive match
  const lower = target.toLowerCase();
  const found = sheetNames.find(s => s.toLowerCase() === lower);
  if (found) return found;
  // Partial match (contains)
  const partial = sheetNames.find(s => s.toLowerCase().includes(lower) || lower.includes(s.toLowerCase()));
  return partial || null;
}

// ─── PULL: Job Entry → App → Job Master ─────────────────────────────

async function handlePull(
  supabase: any,
  token: string,
  spreadsheetId: string,
) {
  const log = { rows_processed: 0, rows_created: 0, rows_updated: 0, rows_skipped: 0, errors: [] as any[] };

  try {
    // 1. Detect tabs
    const sheetNames = await getSheetNames(token, spreadsheetId);
    console.log("Available sheets for pull:", sheetNames);
    
    const jobEntryTab = findTabName(sheetNames, "Job Entry");
    const jobMasterTab = findTabName(sheetNames, "Job Master");
    
    if (!jobEntryTab) {
      return respond({ success: false, error: `No "Job Entry" tab found. Available tabs: ${sheetNames.join(", ")}. Please create a "Job Entry" tab.`, ...log }, 400);
    }
    
    console.log(`Pull: reading from "${jobEntryTab}", will sync to "${jobMasterTab || 'Job Master'}"`);

    // 2. Read Job Entry tab
    const rows = await readSheet(token, spreadsheetId, `'${jobEntryTab}'!A:AZ`);
    if (rows.length < 2) {
      return respond({ success: true, message: "Job Entry tab is empty (no data rows).", ...log });
    }

    const headers = rows[0].map((h: string) => h.trim());
    console.log("Job Entry headers:", headers);
    
    const hIdx: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      hIdx[headers[i]] = i;
    }

    // Auto-add "App Job ID" and "Imported At" columns if missing
    let nextColIdx = headers.length;
    if (!headers.includes("App Job ID")) {
      const col = getColumnLetter(nextColIdx);
      await updateCell(token, spreadsheetId, `'${jobEntryTab}'!${col}1`, "App Job ID");
      headers.push("App Job ID");
      hIdx["App Job ID"] = nextColIdx;
      nextColIdx++;
      console.log("Added 'App Job ID' column to Job Entry");
    }
    if (!headers.includes("Imported At")) {
      const col = getColumnLetter(nextColIdx);
      await updateCell(token, spreadsheetId, `'${jobEntryTab}'!${col}1`, "Imported At");
      headers.push("Imported At");
      hIdx["Imported At"] = nextColIdx;
      nextColIdx++;
      console.log("Added 'Imported At' column to Job Entry");
    }

    const cell = (row: string[], header: string): string => {
      const idx = hIdx[header];
      if (idx === undefined) return "";
      return (row[idx] ?? "").trim();
    };

    // Build mapping: for each header in the sheet, find the app field
    const headerToField: Record<string, string> = {};
    for (const header of headers) {
      const mapped = JOB_ENTRY_HEADER_MAP[header];
      if (mapped) headerToField[header] = mapped;
    }
    console.log("Mapped headers:", JSON.stringify(headerToField));

    // Find the App Job ID column (to check if already imported)
    const appJobIdHeader = "App Job ID"; // guaranteed to exist now
    const importedAtHeader = "Imported At"; // guaranteed to exist now
    const importFlagHeader = headers.find(h => 
      h === "Import?" || h === "Sync to App?" || h === "Import"
    );

    // Clear unresolved sync errors before processing
    await supabase.from("sync_errors").delete().eq("resolved", false);

    // 3. Read Job Master to find existing rows for upsert
    let masterRows: string[][] = [];
    let masterHeaders: string[] = [];
    let masterHIdx: Record<string, number> = {};
    let masterAppJobIds: Record<string, number> = {}; // appJobId → row number
    let masterNextRow = 2;
    
    const actualMasterTab = jobMasterTab || "Job Master";
    if (sheetNames.includes(actualMasterTab)) {
      masterRows = await readSheet(token, spreadsheetId, `'${actualMasterTab}'!A:AZ`);
      if (masterRows.length > 0) {
        masterHeaders = masterRows[0].map((h: string) => h.trim());
        for (let i = 0; i < masterHeaders.length; i++) masterHIdx[masterHeaders[i]] = i;
        
        const masterAppIdCol = masterHIdx["App Job ID"];
        if (masterAppIdCol !== undefined) {
          for (let r = 1; r < masterRows.length; r++) {
            const val = (masterRows[r]?.[masterAppIdCol] ?? "").trim();
            if (val) masterAppJobIds[val] = r + 1;
          }
        }
        masterNextRow = masterRows.length + 1;
      }
    }

    const statusMap: Record<string, string> = {
      "draft": "ready_for_pickup",
      "booked": "ready_for_pickup",
      "new": "ready_for_pickup",
      "enroute": "in_transit",
      "en route": "in_transit",
      "completed": "delivery_complete",
      "cancelled": "cancelled",
      "pending": "ready_for_pickup",
    };

    const parseNum = (val: string): number | null => {
      if (!val) return null;
      const n = parseFloat(val.replace(/[£,]/g, ""));
      return isNaN(n) ? null : n;
    };

    // Normalize date strings like "26-03-03" → "2026-03-03", "25/12/2024" → "2024-12-25"
    const normalizeDate = (val: string): string | null => {
      if (!val) return null;
      const trimmed = val.trim();
      // DD-MM-YY or DD/MM/YY
      let m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
      if (m) {
        const yy = parseInt(m[3], 10);
        const year = yy < 70 ? 2000 + yy : 1900 + yy;
        return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
      // DD-MM-YYYY or DD/MM/YYYY
      m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
      // Already YYYY-MM-DD
      m = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
      if (m) return trimmed;
      // Can't parse — return null to avoid DB error
      console.warn(`Cannot parse date "${val}", skipping field`);
      return null;
    };

    // 4. Process each row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c || c.trim() === "")) continue;

      log.rows_processed++;
      const sheetRowIndex = i + 1;

      // Skip if already imported (has App Job ID)
      if (appJobIdHeader) {
        const existingAppId = cell(row, appJobIdHeader);
        if (existingAppId) {
          log.rows_skipped++;
          continue;
        }
      }

      // Check import flag if it exists (optional)
      if (importFlagHeader) {
        const flag = cell(row, importFlagHeader).toUpperCase();
        // If there's an import flag column but it's not YES, skip
        if (flag && flag !== "YES" && flag !== "Y" && flag !== "TRUE") {
          log.rows_skipped++;
          continue;
        }
      }

      // Build job payload from mapped headers
      const fieldValues: Record<string, string> = {};
      for (const [header, field] of Object.entries(headerToField)) {
        fieldValues[field] = cell(row, header);
      }

      // Determine status
      const rawStatus = (fieldValues["_status_raw"] || "").toLowerCase();
      const appStatus = statusMap[rawStatus] || "ready_for_pickup";

      // Build the job insert payload
      const jobPayload: Record<string, any> = {
        status: appStatus,
        // Required fields with defaults
        vehicle_reg: fieldValues["vehicle_reg"] || "UNKNOWN",
        vehicle_make: fieldValues["vehicle_make"] || "",
        vehicle_model: fieldValues["vehicle_model"] || "",
        vehicle_colour: fieldValues["vehicle_colour"] || "",
        pickup_contact_name: fieldValues["pickup_contact_name"] || fieldValues["client_name"] || "Unknown",
        pickup_contact_phone: fieldValues["pickup_contact_phone"] || "",
        pickup_address_line1: fieldValues["pickup_address_line1"] || fieldValues["pickup_postcode"] || "",
        pickup_city: fieldValues["pickup_city"] || "",
        pickup_postcode: fieldValues["pickup_postcode"] || "",
        delivery_contact_name: fieldValues["delivery_contact_name"] || fieldValues["client_name"] || "Unknown",
        delivery_contact_phone: fieldValues["delivery_contact_phone"] || "",
        delivery_address_line1: fieldValues["delivery_address_line1"] || fieldValues["delivery_postcode"] || "",
        delivery_city: fieldValues["delivery_city"] || "",
        delivery_postcode: fieldValues["delivery_postcode"] || "",
      };

      // Optional fields
      if (fieldValues["external_job_number"]) {
        jobPayload.external_job_number = fieldValues["external_job_number"];
        jobPayload.sheet_job_id = fieldValues["external_job_number"];
      }
      if (fieldValues["job_date"]) {
        const parsed = normalizeDate(fieldValues["job_date"]);
        if (parsed) jobPayload.job_date = parsed;
      }
      if (fieldValues["priority"]) jobPayload.priority = fieldValues["priority"];
      if (fieldValues["job_type"]) jobPayload.job_type = fieldValues["job_type"];
      if (fieldValues["job_source"]) jobPayload.job_source = fieldValues["job_source"];
      if (fieldValues["client_name"]) jobPayload.client_name = fieldValues["client_name"];
      if (fieldValues["client_notes"]) jobPayload.client_notes = fieldValues["client_notes"];
      if (fieldValues["client_phone"]) jobPayload.client_phone = fieldValues["client_phone"];
      if (fieldValues["client_email"]) jobPayload.client_email = fieldValues["client_email"];
      if (fieldValues["client_company"]) jobPayload.client_company = fieldValues["client_company"];
      if (fieldValues["pickup_company"]) jobPayload.pickup_company = fieldValues["pickup_company"];
      if (fieldValues["pickup_time_from"]) jobPayload.pickup_time_from = fieldValues["pickup_time_from"];
      if (fieldValues["pickup_time_to"]) jobPayload.pickup_time_to = fieldValues["pickup_time_to"];
      if (fieldValues["pickup_access_notes"]) jobPayload.pickup_access_notes = fieldValues["pickup_access_notes"];
      if (fieldValues["pickup_notes"]) jobPayload.pickup_notes = fieldValues["pickup_notes"];
      if (fieldValues["delivery_company"]) jobPayload.delivery_company = fieldValues["delivery_company"];
      if (fieldValues["delivery_time_from"]) jobPayload.delivery_time_from = fieldValues["delivery_time_from"];
      if (fieldValues["delivery_time_to"]) jobPayload.delivery_time_to = fieldValues["delivery_time_to"];
      if (fieldValues["delivery_access_notes"]) jobPayload.delivery_access_notes = fieldValues["delivery_access_notes"];
      if (fieldValues["promise_by_time"]) jobPayload.promise_by_time = fieldValues["promise_by_time"];
      if (fieldValues["vehicle_type"]) jobPayload.vehicle_type = fieldValues["vehicle_type"];
      if (fieldValues["vehicle_fuel_type"]) jobPayload.vehicle_fuel_type = fieldValues["vehicle_fuel_type"];
      if (fieldValues["distance_miles"]) jobPayload.distance_miles = parseNum(fieldValues["distance_miles"]);
      if (fieldValues["rate_per_mile"]) jobPayload.rate_per_mile = parseNum(fieldValues["rate_per_mile"]);
      if (fieldValues["total_price"]) jobPayload.total_price = parseNum(fieldValues["total_price"]);
      if (fieldValues["caz_ulez_flag"]) jobPayload.caz_ulez_flag = fieldValues["caz_ulez_flag"];
      if (fieldValues["caz_ulez_cost"]) jobPayload.caz_ulez_cost = parseNum(fieldValues["caz_ulez_cost"]);
      if (fieldValues["other_expenses"]) jobPayload.other_expenses = parseNum(fieldValues["other_expenses"]);
      if (fieldValues["driver_name"]) jobPayload.driver_name = fieldValues["driver_name"];
      if (fieldValues["driver_external_id"]) jobPayload.driver_external_id = fieldValues["driver_external_id"];
      if (fieldValues["job_notes"]) jobPayload.job_notes = fieldValues["job_notes"];
      if (fieldValues["cancellation_reason"]) jobPayload.cancellation_reason = fieldValues["cancellation_reason"];
      if (fieldValues["vehicle_year"]) jobPayload.vehicle_year = fieldValues["vehicle_year"];

      // Validate minimum required fields
      const missingFields: string[] = [];
      for (const reqField of JOB_ENTRY_REQUIRED_FIELDS) {
        const val = jobPayload[reqField];
        if (!val || val === "" || val === "UNKNOWN") {
          const headerName = Object.entries(headerToField).find(([_, f]) => f === reqField)?.[0] || reqField;
          missingFields.push(headerName);
        }
      }

      if (missingFields.length > 0) {
        const sheetJobId = fieldValues["external_job_number"] || `Row ${sheetRowIndex}`;
        await supabase.from("sync_errors").insert({
          sheet_row_index: sheetRowIndex,
          sheet_job_id: sheetJobId,
          missing_fields: missingFields,
          error_message: `Missing required fields: ${missingFields.join(", ")}`,
        });
        log.errors.push({ row: sheetRowIndex, sheetJobId, missing: missingFields });
        log.rows_skipped++;
        continue;
      }

      // Check for duplicate (by external_job_number if present)
      if (jobPayload.external_job_number) {
        const { data: existing } = await supabase
          .from("jobs")
          .select("id")
          .or(`sheet_job_id.eq.${jobPayload.external_job_number},external_job_number.eq.${jobPayload.external_job_number}`)
          .maybeSingle();
        
        if (existing) {
          // Already exists, write back the ID to Job Entry and skip
          if (appJobIdHeader && hIdx[appJobIdHeader] !== undefined) {
            const col = getColumnLetter(hIdx[appJobIdHeader]);
            await updateCell(token, spreadsheetId, `'${jobEntryTab}'!${col}${sheetRowIndex}`, existing.id);
          }
          log.rows_skipped++;
          continue;
        }
      }

      // 5. INSERT the job into the database
      console.log(`Creating job from Job Entry row ${sheetRowIndex}:`, JSON.stringify(jobPayload));
      const { data: newJob, error: insertErr } = await supabase
        .from("jobs")
        .insert(jobPayload)
        .select("id, external_job_number, created_at, status")
        .single();

      if (insertErr) {
        console.error(`Insert error for row ${sheetRowIndex}:`, insertErr);
        log.errors.push({ row: sheetRowIndex, error: insertErr.message });
        log.rows_skipped++;
        continue;
      }

      console.log(`Job created: ${newJob.id} from row ${sheetRowIndex}`);

      // 5b. Auto-generate external_job_number if missing
      if (!newJob.external_job_number) {
        const { data: maxRow } = await supabase
          .from("jobs")
          .select("external_job_number")
          .like("external_job_number", "AX%")
          .order("external_job_number", { ascending: false })
          .limit(1);
        let nextNum = 1;
        if (maxRow && maxRow.length > 0 && maxRow[0].external_job_number) {
          const m = maxRow[0].external_job_number.match(/^AX(\d+)$/);
          if (m) nextNum = parseInt(m[1], 10) + 1;
        }
        const genNumber = `AX${String(nextNum).padStart(4, "0")}`;
        await supabase.from("jobs").update({ external_job_number: genNumber }).eq("id", newJob.id);
        newJob.external_job_number = genNumber;
        jobPayload.external_job_number = genNumber;
        console.log(`Auto-generated job number: ${genNumber} for ${newJob.id}`);
      }

      // 6. Write back to Job Entry: App Job ID + Imported At
      const now = new Date().toISOString();
      if (appJobIdHeader && hIdx[appJobIdHeader] !== undefined) {
        const col = getColumnLetter(hIdx[appJobIdHeader]);
        await updateCell(token, spreadsheetId, `'${jobEntryTab}'!${col}${sheetRowIndex}`, newJob.id);
      }
      if (importedAtHeader && hIdx[importedAtHeader] !== undefined) {
        const col = getColumnLetter(hIdx[importedAtHeader]);
        await updateCell(token, spreadsheetId, `'${jobEntryTab}'!${col}${sheetRowIndex}`, now);
      }

      // 7. Upsert to Job Master tab
      if (sheetNames.includes(actualMasterTab)) {
        try {
          await upsertJobMasterRow(
            supabase, token, spreadsheetId, actualMasterTab,
            newJob, jobPayload, masterHIdx, masterAppJobIds, masterNextRow
          );
          // Update sheet_row_index on the job
          const masterRow = masterAppJobIds[newJob.id] || masterNextRow;
          if (!masterAppJobIds[newJob.id]) {
            masterAppJobIds[newJob.id] = masterNextRow;
            masterNextRow++;
          }
          await supabase.from("jobs").update({ sheet_row_index: masterRow }).eq("id", newJob.id);
        } catch (masterErr: any) {
          console.error(`Failed to upsert Job Master for ${newJob.id}:`, masterErr);
          // Non-fatal: job was created, just master sync failed
          log.errors.push({ row: sheetRowIndex, warning: `Job created but Job Master sync failed: ${masterErr.message}` });
        }
      }

      log.rows_created++;
    }

    // 8. Update last_pull_at
    const { data: cfgId } = await supabase.from("sheet_sync_config").select("id").single();
    if (cfgId) {
      await supabase.from("sheet_sync_config").update({ last_pull_at: new Date().toISOString() }).eq("id", cfgId.id);
    }

    // 9. Log sync
    await supabase.from("sheet_sync_logs").insert({
      direction: "pull",
      status: log.errors.length ? "partial" : "success",
      ...log,
    });

    return respond({ success: true, ...log });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Pull error:", msg);
    log.errors.push({ error: msg });
    await supabase.from("sheet_sync_logs").insert({
      direction: "pull",
      status: "error",
      ...log,
    });
    return respond({ success: false, error: msg, ...log }, 500);
  }
}

// ─── Upsert a single job row into Job Master ─────────────────────────

async function upsertJobMasterRow(
  supabase: any,
  token: string,
  spreadsheetId: string,
  masterTab: string,
  newJob: { id: string; external_job_number?: string; created_at: string; status: string },
  jobPayload: Record<string, any>,
  masterHIdx: Record<string, number>,
  masterAppJobIds: Record<string, number>,
  masterNextRow: number,
) {
  const sheetStatus = REVERSE_STATUS_MAP[newJob.status] || newJob.status || "Booked";
  
  const rowValues = JOB_MASTER_HEADERS.map((header: string) => {
    switch (header) {
      case "Job ID": return newJob.external_job_number || "";
      case "Job Date": return jobPayload.job_date || "";
      case "Job Status": return sheetStatus;
      case "Job Priority": return jobPayload.priority || "";
      case "Job Type": return jobPayload.job_type || "";
      case "Job Source": return jobPayload.job_source || "";
      case "Created At": return newJob.created_at || "";
      case "Updated At": return new Date().toISOString();
      case "Client Name": return jobPayload.client_name || "";
      case "Client Notes": return jobPayload.client_notes || "";
      case "Pickup Contact Name": return jobPayload.pickup_contact_name || "";
      case "Pickup Contact Phone": return jobPayload.pickup_contact_phone || "";
      case "Pickup Address Line 1": return [jobPayload.pickup_address_line1, jobPayload.pickup_address_line2].filter(Boolean).join(" ") || "";
      case "Pickup Town / City": return jobPayload.pickup_city || "";
      case "Pickup Postcode": return jobPayload.pickup_postcode || "";
      case "Pickup Time From": return jobPayload.pickup_time_from || "";
      case "Pickup Time To": return jobPayload.pickup_time_to || "";
      case "Pickup Access Notes": return jobPayload.pickup_access_notes || "";
      case "Delivery Contact Name": return jobPayload.delivery_contact_name || "";
      case "Delivery Contact Phone": return jobPayload.delivery_contact_phone || "";
      case "Delivery Address Line 1": return [jobPayload.delivery_address_line1, jobPayload.delivery_address_line2].filter(Boolean).join(" ") || "";
      case "Delivery Town / City": return jobPayload.delivery_city || "";
      case "Delivery Postcode": return jobPayload.delivery_postcode || "";
      case "Delivery Time From": return jobPayload.delivery_time_from || "";
      case "Delivery Time To": return jobPayload.delivery_time_to || "";
      case "Delivery Access Notes": return jobPayload.delivery_access_notes || "";
      case "Promise By Time": return jobPayload.promise_by_time || "";
      case "Vehicle Reg": return jobPayload.vehicle_reg || "";
      case "Vehicle Make": return jobPayload.vehicle_make || "";
      case "Vehicle Model": return jobPayload.vehicle_model || "";
      case "Vehicle Colour": return jobPayload.vehicle_colour || "";
      case "Vehicle Type": return jobPayload.vehicle_type || "";
      case "Vehicle Fuel Type": return jobPayload.vehicle_fuel_type || "";
      case "Distance (Miles)": return jobPayload.distance_miles != null ? String(jobPayload.distance_miles) : "";
      case "Rate (£ per mile)": return jobPayload.rate_per_mile != null ? String(jobPayload.rate_per_mile) : "";
      case "Total Price (£)": return jobPayload.total_price != null ? String(jobPayload.total_price) : "";
      case "CAZ/ULEZ?": return jobPayload.caz_ulez_flag || "";
      case "CAZ/ULEZ Cost (£)": return jobPayload.caz_ulez_cost != null ? String(jobPayload.caz_ulez_cost) : "";
      case "Other Expenses (£)": return jobPayload.other_expenses != null ? String(jobPayload.other_expenses) : "";
      case "Driver Name": return jobPayload.driver_name || "";
      case "Driver ID": return jobPayload.driver_external_id || "";
      case "Job Notes": return jobPayload.job_notes || "";
      case "Cancellation Reason": return jobPayload.cancellation_reason || "";
      case "Sync to App?": return "YES";
      case "App Job ID": return newJob.id;
      case "Sync to Map?": return "NO";
      case "Map Job ID": return "";
      default: return "";
    }
  });

  const lastCol = getColumnLetter(JOB_MASTER_HEADERS.length - 1);
  const existingRow = masterAppJobIds[newJob.id];

  if (existingRow) {
    await updateRow(token, spreadsheetId, `'${masterTab}'!A${existingRow}:${lastCol}${existingRow}`, rowValues);
  } else {
    await updateRow(token, spreadsheetId, `'${masterTab}'!A${masterNextRow}:${lastCol}${masterNextRow}`, rowValues);
    masterAppJobIds[newJob.id] = masterNextRow;
  }
}

// ─── PUSH: App → Sheet (Write jobs to Job Master) ───────────────────

const REVERSE_STATUS_MAP: Record<string, string> = {
  ready_for_pickup: "Booked",
  pickup_in_progress: "En Route",
  pickup_complete: "En Route",
  in_transit: "En Route",
  delivery_in_progress: "En Route",
  delivery_complete: "Completed",
  pod_ready: "Completed",
  completed: "Completed",
  cancelled: "Cancelled",
};

async function handlePush(
  supabase: any,
  token: string,
  spreadsheetId: string,
  sheetName: string,
  jobIds?: string[]
) {
  const log = { rows_processed: 0, rows_created: 0, rows_updated: 0, rows_skipped: 0, errors: [] as any[] };

  try {
    // 1. Fetch jobs from Supabase
    let query = supabase.from("jobs").select("*").eq("is_hidden", false);
    if (jobIds && jobIds.length > 0) {
      query = query.in("id", jobIds);
    }
    const { data: jobs, error: jobsErr } = await query;
    if (jobsErr) throw jobsErr;
    if (!jobs || jobs.length === 0) {
      return respond({ success: true, message: "No jobs to push.", ...log });
    }

    // 2. Fetch expenses aggregated per job
    const jobIdList = jobs.map((j: any) => j.id);
    const { data: expenses } = await supabase
      .from("expenses")
      .select("job_id, amount")
      .in("job_id", jobIdList)
      .eq("is_hidden", false);
    const expensesByJob: Record<string, number> = {};
    for (const e of expenses ?? []) {
      expensesByJob[e.job_id] = (expensesByJob[e.job_id] || 0) + Number(e.amount || 0);
    }

    // 3. Read existing sheet to find App Job ID column for de-duplication
    const rows = await readSheet(token, spreadsheetId, `'${sheetName}'!A:AZ`);
    const headers = (rows[0] ?? []).map((h: string) => h.trim());
    const hIdx: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) hIdx[headers[i]] = i;

    const appJobIdColIdx = hIdx["App Job ID"];
    const existingAppIds: Record<string, number> = {};
    if (appJobIdColIdx !== undefined) {
      for (let r = 1; r < rows.length; r++) {
        const val = (rows[r]?.[appJobIdColIdx] ?? "").trim();
        if (val) existingAppIds[val] = r + 1;
      }
    }

    let nextRow = rows.length + 1;

    // 4. Push each job
    for (const job of jobs) {
      log.rows_processed++;
      const totalExpenses = expensesByJob[job.id] || 0;
      const sheetStatus = REVERSE_STATUS_MAP[job.status] || job.status || "";

      const rowValues = JOB_MASTER_HEADERS.map((header: string) => {
        switch (header) {
          case "Job ID": return job.external_job_number || "";
          case "Job Date": return job.job_date || "";
          case "Job Status": return sheetStatus;
          case "Job Priority": return job.priority || "";
          case "Job Type": return job.job_type || "";
          case "Job Source": return job.job_source || "";
          case "Created At": return job.created_at || "";
          case "Updated At": return job.updated_at || "";
          case "Client Name": return job.client_name || "";
          case "Client Notes": return job.client_notes || "";
          case "Pickup Contact Name": return job.pickup_contact_name || "";
          case "Pickup Contact Phone": return job.pickup_contact_phone || "";
          case "Pickup Address Line 1": return [job.pickup_address_line1, job.pickup_address_line2].filter(Boolean).join(" ") || "";
          case "Pickup Town / City": return job.pickup_city || "";
          case "Pickup Postcode": return job.pickup_postcode || "";
          case "Pickup Time From": return job.pickup_time_from || "";
          case "Pickup Time To": return job.pickup_time_to || "";
          case "Pickup Access Notes": return job.pickup_access_notes || "";
          case "Delivery Contact Name": return job.delivery_contact_name || "";
          case "Delivery Contact Phone": return job.delivery_contact_phone || "";
          case "Delivery Address Line 1": return [job.delivery_address_line1, job.delivery_address_line2].filter(Boolean).join(" ") || "";
          case "Delivery Town / City": return job.delivery_city || "";
          case "Delivery Postcode": return job.delivery_postcode || "";
          case "Delivery Time From": return job.delivery_time_from || "";
          case "Delivery Time To": return job.delivery_time_to || "";
          case "Delivery Access Notes": return job.delivery_access_notes || "";
          case "Promise By Time": return job.promise_by_time || "";
          case "Vehicle Reg": return job.vehicle_reg || "";
          case "Vehicle Make": return job.vehicle_make || "";
          case "Vehicle Model": return job.vehicle_model || "";
          case "Vehicle Colour": return job.vehicle_colour || "";
          case "Vehicle Type": return job.vehicle_type || "";
          case "Vehicle Fuel Type": return job.vehicle_fuel_type || "";
          case "Distance (Miles)": return job.distance_miles != null ? String(job.distance_miles) : "";
          case "Rate (£ per mile)": return job.rate_per_mile != null ? String(job.rate_per_mile) : "";
          case "Total Price (£)": return job.total_price != null ? String(job.total_price) : "";
          case "CAZ/ULEZ?": return job.caz_ulez_flag || "";
          case "CAZ/ULEZ Cost (£)": return job.caz_ulez_cost != null ? String(job.caz_ulez_cost) : "";
          case "Other Expenses (£)": return totalExpenses > 0 ? String(totalExpenses) : (job.other_expenses != null ? String(job.other_expenses) : "");
          case "Driver Name": return job.driver_name || "";
          case "Driver ID": return job.driver_external_id || "";
          case "Job Notes": return job.job_notes || "";
          case "Cancellation Reason": return job.cancellation_reason || "";
          case "Sync to App?": return "YES";
          case "App Job ID": return job.id;
          case "Sync to Map?": return job.sync_to_map ? "YES" : "NO";
          case "Map Job ID": return "";
          default: return "";
        }
      });

      const existingRow = existingAppIds[job.id] || (job.sheet_row_index ? job.sheet_row_index : null);
      const lastCol = getColumnLetter(JOB_MASTER_HEADERS.length - 1);

      if (existingRow) {
        await appendRow(token, spreadsheetId, `'${sheetName}'!A${existingRow}:${lastCol}${existingRow}`, rowValues);
        await supabase.from("jobs").update({ sheet_row_index: existingRow }).eq("id", job.id);
        log.rows_updated++;
      } else {
        const targetRow = nextRow;
        await appendRow(token, spreadsheetId, `'${sheetName}'!A${targetRow}:${lastCol}${targetRow}`, rowValues);
        await supabase.from("jobs").update({ sheet_row_index: targetRow }).eq("id", job.id);
        existingAppIds[job.id] = targetRow;
        nextRow++;
        log.rows_created++;
      }
    }

    // 5. Update last_push_at
    const { data: cfgId } = await supabase.from("sheet_sync_config").select("id").single();
    if (cfgId) {
      await supabase.from("sheet_sync_config").update({ last_push_at: new Date().toISOString() }).eq("id", cfgId.id);
    }

    // 6. Log sync
    await supabase.from("sheet_sync_logs").insert({
      direction: "push",
      status: log.errors.length ? "partial" : "success",
      ...log,
    });

    return respond({ success: true, ...log });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.errors.push({ error: msg });
    await supabase.from("sheet_sync_logs").insert({
      direction: "push",
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
