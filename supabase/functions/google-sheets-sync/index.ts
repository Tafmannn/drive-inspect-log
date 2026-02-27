import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Google Auth via Service Account ─────────────────────────────────

async function getAccessToken(serviceAccount: any): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = btoa(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${claimSet}`;

  // Import the private key
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

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const base64Signature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  // URL-safe base64
  const jwt = `${header}.${claimSet}.${base64Signature}`
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Actually we need standard base64 for JWT, let me redo with proper base64url
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

async function readSheet(
  token: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
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

async function updateSheet(
  token: string,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets update failed [${res.status}]: ${err}`);
  }
}

async function appendSheet(
  token: string,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets append failed [${res.status}]: ${err}`);
  }
}

// ─── Column mapping ──────────────────────────────────────────────────

// Map from job data to sheet row (A-N = indices 0-13)
function jobToRow(job: any, expenses: number): (string | number | null)[] {
  const row: (string | number | null)[] = new Array(14).fill(null);
  // A: Date
  row[0] = job.created_at
    ? new Date(job.created_at).toLocaleDateString("en-GB")
    : "";
  // B: Client
  row[1] = job.pickup_company || job.pickup_contact_name || "";
  // C: Reg
  row[2] = job.vehicle_reg || "";
  // D: Start PC
  row[3] = job.pickup_postcode || "";
  // E: End PC
  row[4] = job.delivery_postcode || "";
  // F: Miles (from odometer — we'll compute from inspections)
  row[5] = job.odometer_miles ?? "";
  // G: Rate — SKIP (sheet-owned)
  row[6] = null;
  // H: Expenses
  row[7] = expenses !== 0 ? -Math.abs(expenses) : "";
  // I: Total — SKIP (formula)
  row[8] = null;
  // J: Status — map to friendly name
  row[9] = null; // skip on push, only read on pull
  // K: Invoice Link / POD
  row[10] = job.pod_pdf_url || "";
  // L: Job ID (anchor)
  row[11] = job.external_job_number || "";
  // M: Alerts — SKIP
  row[12] = null;
  // N: Bid Phrase — SKIP
  row[13] = null;
  return row;
}

// Columns that are safe to write to sheet (indices)
const PUSH_COLUMNS = [0, 1, 2, 3, 4, 5, 7, 10, 11]; // A,B,C,D,E,F,H,K,L

// Status mapping: sheet → app
const STATUS_SHEET_TO_APP: Record<string, string> = {
  completed: "delivery_complete",
  "delivery complete": "delivery_complete",
  "pod ready": "pod_ready",
  "pod_ready": "pod_ready",
  "in transit": "in_transit",
  "in_transit": "in_transit",
  "pickup complete": "pickup_complete",
  "pickup_complete": "pickup_complete",
  booked: "ready_for_pickup",
  ready_for_pickup: "ready_for_pickup",
  cancelled: "cancelled",
};

// Status mapping: app → sheet
const STATUS_APP_TO_SHEET: Record<string, string> = {
  ready_for_pickup: "Booked",
  pickup_in_progress: "Pickup In Progress",
  pickup_complete: "Pickup Complete",
  in_transit: "In Transit",
  delivery_in_progress: "Delivery In Progress",
  delivery_complete: "Delivery Complete",
  pod_ready: "POD Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

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

    const { action, jobIds } = await req.json();

    // Get sync config
    const { data: config, error: cfgErr } = await supabase
      .from("sheet_sync_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Google Sheet not configured. Please set up the connection in Admin settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.is_enabled) {
      return new Response(
        JSON.stringify({ error: "Sheet sync is currently disabled." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAccessToken(serviceAccount);
    const { spreadsheet_id, sheet_name } = config;

    if (action === "push") {
      return await handlePush(supabase, token, spreadsheet_id, sheet_name, jobIds);
    } else if (action === "pull") {
      return await handlePull(supabase, token, spreadsheet_id, sheet_name);
    } else if (action === "test") {
      // Quick connectivity test
      const rows = await readSheet(token, spreadsheet_id, `${sheet_name}!A1:N1`);
      return new Response(
        JSON.stringify({ success: true, headers: rows[0] ?? [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Sheet sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── PUSH: App → Sheet ──────────────────────────────────────────────

async function handlePush(
  supabase: any,
  token: string,
  spreadsheetId: string,
  sheetName: string,
  jobIds?: string[]
) {
  const log = { rows_processed: 0, rows_created: 0, rows_updated: 0, rows_skipped: 0, errors: [] as any[] };

  try {
    // Get jobs to push
    let jobQuery = supabase.from("jobs").select("*").eq("is_hidden", false).order("created_at", { ascending: true });
    if (jobIds?.length) {
      jobQuery = jobQuery.in("id", jobIds);
    }
    const { data: jobs, error: jobErr } = await jobQuery;
    if (jobErr) throw jobErr;

    if (!jobs?.length) {
      return respond({ success: true, message: "No jobs to push.", ...log });
    }

    // Get expenses totals per job
    const { data: expData } = await supabase
      .from("expenses")
      .select("job_id, amount")
      .eq("is_hidden", false);
    const expByJob: Record<string, number> = {};
    for (const e of expData ?? []) {
      expByJob[e.job_id] = (expByJob[e.job_id] ?? 0) + Number(e.amount);
    }

    // Get odometer data from inspections
    const jobIdsAll = jobs.map((j: any) => j.id);
    const { data: inspections } = await supabase
      .from("inspections")
      .select("job_id, type, odometer")
      .in("job_id", jobIdsAll);
    const odomByJob: Record<string, { pickup?: number; delivery?: number }> = {};
    for (const insp of inspections ?? []) {
      if (!odomByJob[insp.job_id]) odomByJob[insp.job_id] = {};
      if (insp.type === "pickup") odomByJob[insp.job_id].pickup = insp.odometer;
      if (insp.type === "delivery") odomByJob[insp.job_id].delivery = insp.odometer;
    }

    // Read existing sheet data to find existing job IDs
    const existingRows = await readSheet(token, spreadsheetId, `${sheetName}!A:N`);
    const headerRow = existingRows[0] ?? [];
    const jobIdColIdx = 11; // L column (0-indexed)

    // Map: jobNumber → rowIndex (1-indexed in sheets, skip header)
    const existingMap: Record<string, number> = {};
    for (let i = 1; i < existingRows.length; i++) {
      const jobNum = existingRows[i]?.[jobIdColIdx]?.trim();
      if (jobNum) existingMap[jobNum] = i + 1; // 1-indexed for Sheets API
    }

    for (const job of jobs) {
      log.rows_processed++;
      const jobNum = job.external_job_number;
      if (!jobNum) {
        log.rows_skipped++;
        log.errors.push({ jobId: job.id, error: "No external_job_number" });
        continue;
      }

      // Compute miles from odometer readings
      const odom = odomByJob[job.id];
      let miles: number | string = "";
      if (odom?.pickup != null && odom?.delivery != null) {
        miles = Math.abs(odom.delivery - odom.pickup);
      }

      const enrichedJob = { ...job, odometer_miles: miles };
      const expenses = expByJob[job.id] ?? 0;
      const row = jobToRow(enrichedJob, expenses);

      // Set status in J column for push
      row[9] = STATUS_APP_TO_SHEET[job.status] || job.status;

      if (existingMap[jobNum]) {
        // Update existing row — only push-safe columns
        const sheetRow = existingMap[jobNum];
        // Read existing row to preserve formula columns
        const existingRowData = existingRows[sheetRow - 1] ?? [];
        const mergedRow = [...existingRowData];
        // Extend if needed
        while (mergedRow.length < 14) mergedRow.push("");

        for (const colIdx of PUSH_COLUMNS) {
          if (row[colIdx] !== null) {
            mergedRow[colIdx] = String(row[colIdx]);
          }
        }
        // Also push status (J=9) on push
        mergedRow[9] = String(row[9] ?? existingRowData[9] ?? "");

        await updateSheet(token, spreadsheetId, `${sheetName}!A${sheetRow}:N${sheetRow}`, [mergedRow]);
        log.rows_updated++;
      } else {
        // Append new row
        const newRow = row.map((v, i) => {
          // Skip formula columns I, M, N
          if (i === 8 || i === 12 || i === 13) return "";
          return v ?? "";
        });
        // Set status for new rows
        newRow[9] = STATUS_APP_TO_SHEET[job.status] || job.status;
        await appendSheet(token, spreadsheetId, `${sheetName}!A:N`, [newRow]);
        log.rows_created++;
      }
    }

    // Update last_push_at
    await supabase
      .from("sheet_sync_config")
      .update({ last_push_at: new Date().toISOString() })
      .eq("id", (await supabase.from("sheet_sync_config").select("id").single()).data.id);

    // Log
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

// ─── PULL: Sheet → App ──────────────────────────────────────────────

async function handlePull(
  supabase: any,
  token: string,
  spreadsheetId: string,
  sheetName: string
) {
  const log = { rows_processed: 0, rows_created: 0, rows_updated: 0, rows_skipped: 0, errors: [] as any[] };

  try {
    const rows = await readSheet(token, spreadsheetId, `${sheetName}!A:N`);
    if (rows.length < 2) {
      return respond({ success: true, message: "Sheet is empty.", ...log });
    }

    // Skip header
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      log.rows_processed++;
      const jobNum = row[11]?.trim(); // L column
      if (!jobNum) {
        log.rows_skipped++;
        continue;
      }

      // Find job in DB
      const { data: job } = await supabase
        .from("jobs")
        .select("id, status, admin_rate")
        .eq("external_job_number", jobNum)
        .maybeSingle();

      if (!job) {
        log.rows_skipped++;
        log.errors.push({ row: i + 1, jobNum, error: "Job not found in app" });
        continue;
      }

      const updates: Record<string, any> = {};

      // G column (index 6): Rate → admin_rate
      const rateVal = row[6]?.trim();
      if (rateVal && rateVal !== "") {
        const parsed = parseFloat(rateVal);
        if (!isNaN(parsed) && parsed !== Number(job.admin_rate)) {
          updates.admin_rate = parsed;
        }
      }

      // J column (index 9): Status → job status
      const statusVal = row[9]?.trim()?.toLowerCase();
      if (statusVal && statusVal !== "") {
        const mappedStatus = STATUS_SHEET_TO_APP[statusVal];
        if (mappedStatus && mappedStatus !== job.status) {
          updates.status = mappedStatus;
          // If completing, set completed_at
          if (
            ["delivery_complete", "pod_ready"].includes(mappedStatus) &&
            !["delivery_complete", "pod_ready", "completed"].includes(job.status)
          ) {
            updates.completed_at = new Date().toISOString();
          }
        } else if (!mappedStatus && statusVal) {
          log.errors.push({
            row: i + 1,
            jobNum,
            error: `Unknown status: "${row[9]}"`,
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from("jobs")
          .update(updates)
          .eq("id", job.id);
        if (updateErr) {
          log.errors.push({ row: i + 1, jobNum, error: updateErr.message });
        } else {
          log.rows_updated++;
        }
      } else {
        log.rows_skipped++;
      }
    }

    // Update last_pull_at
    const { data: cfgId } = await supabase
      .from("sheet_sync_config")
      .select("id")
      .single();
    if (cfgId) {
      await supabase
        .from("sheet_sync_config")
        .update({ last_pull_at: new Date().toISOString() })
        .eq("id", cfgId.id);
    }

    // Log
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

function respond(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
