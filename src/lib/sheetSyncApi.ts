import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/google-sheets-sync`;

async function callSync(body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Sync failed (${res.status})`);
  return data;
}

export async function pushToSheet(jobIds?: string[]) {
  // Skip if no sheet is configured to avoid noisy 400 errors
  const config = await getSheetSyncConfig();
  if (!config || !config.is_enabled || !config.spreadsheet_id) return null;
  return callSync({ action: "push", jobIds });
}

export async function pullFromSheet() {
  return callSync({ action: "pull" });
}

export async function testSheetConnection() {
  return callSync({ action: "test" });
}

// ─── Config CRUD ─────────────────────────────────────────────────────

export interface SheetSyncConfig {
  id: string;
  spreadsheet_id: string;
  sheet_name: string;
  is_enabled: boolean;
  column_mapping: Record<string, any>;
  last_push_at: string | null;
  last_pull_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSheetSyncConfig(): Promise<SheetSyncConfig | null> {
  const { data, error } = await supabase
    .from("sheet_sync_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as SheetSyncConfig | null;
}

export async function upsertSheetSyncConfig(
  input: Partial<SheetSyncConfig> & { spreadsheet_id: string; sheet_name: string }
): Promise<SheetSyncConfig> {
  const existing = await getSheetSyncConfig();
  if (existing) {
    const { data, error } = await supabase
      .from("sheet_sync_config")
      .update(input)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as SheetSyncConfig;
  }
  const { data, error } = await supabase
    .from("sheet_sync_config")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as SheetSyncConfig;
}

// ─── Sync Logs ───────────────────────────────────────────────────────

export interface SyncLog {
  id: string;
  direction: "push" | "pull";
  status: "success" | "partial" | "error";
  rows_processed: number;
  rows_created: number;
  rows_updated: number;
  rows_skipped: number;
  errors: any[];
  details: any;
  created_at: string;
}

export async function getSyncLogs(limit = 20): Promise<SyncLog[]> {
  const { data, error } = await supabase
    .from("sheet_sync_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SyncLog[];
}
