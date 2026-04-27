// Client profile CRUD API
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "./orgHelper";

export interface Client {
  id: string;
  org_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Admin-only rate card stored in `client_rate_cards`.
 * RLS: only admin/super_admin (org-scoped) can read or write.
 * Drivers physically cannot fetch this — Supabase will return zero rows.
 */
export interface ClientRateCardRow {
  client_id: string;
  org_id: string;
  rate_per_mile: number | null;
  minimum_charge: number | null;
  agreed_price: number | null;
  waiting_rate_per_hour: number | null;
  rate_card_active: boolean;
  rate_card_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientRateCard {
  ratePerMile: number | null;
  minimumCharge: number | null;
  agreedPrice: number | null;
  waitingRatePerHour: number | null;
  notes: string | null;
}

export interface ClientRateCardInput {
  rate_per_mile: number | null;
  minimum_charge: number | null;
  agreed_price: number | null;
  waiting_rate_per_hour: number | null;
  rate_card_active: boolean;
  rate_card_notes: string | null;
}

/**
 * Fetch the active rate card for a client.
 *
 * Drivers and non-admins are physically blocked by RLS on
 * `client_rate_cards` — this function will return null for them.
 */
export async function getActiveClientRateCard(
  clientId: string
): Promise<ClientRateCard | null> {
  if (!clientId) return null;
  const { data, error } = await (supabase as any)
    .from("client_rate_cards")
    .select(
      "rate_card_active, rate_per_mile, minimum_charge, agreed_price, waiting_rate_per_hour, rate_card_notes"
    )
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    rate_card_active: boolean | null;
    rate_per_mile: number | null;
    minimum_charge: number | null;
    agreed_price: number | null;
    waiting_rate_per_hour: number | null;
    rate_card_notes: string | null;
  };
  if (!row.rate_card_active) return null;
  return {
    ratePerMile: row.rate_per_mile,
    minimumCharge: row.minimum_charge,
    agreedPrice: row.agreed_price,
    waitingRatePerHour: row.waiting_rate_per_hour,
    notes: row.rate_card_notes,
  };
}

/**
 * Fetch the full rate card row (for admin edit UI). Returns null if
 * none exists OR if the caller is not allowed by RLS.
 */
export async function getClientRateCardRow(
  clientId: string
): Promise<ClientRateCardRow | null> {
  if (!clientId) return null;
  const { data, error } = await (supabase as any)
    .from("client_rate_cards")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClientRateCardRow;
}

/**
 * Upsert a rate card. Admin-only via RLS — drivers will receive an error.
 */
export async function upsertClientRateCard(
  clientId: string,
  input: ClientRateCardInput
): Promise<void> {
  const orgId = await getOrgId();
  const { error } = await (supabase as any)
    .from("client_rate_cards")
    .upsert(
      {
        client_id: clientId,
        org_id: orgId,
        ...input,
      },
      { onConflict: "client_id" }
    );
  if (error) throw error;
}

export type ClientInsert = Omit<Client, "id" | "org_id" | "created_at" | "updated_at">;
export type ClientUpdate = Partial<ClientInsert>;

export async function listClients(opts?: {
  search?: string;
  includeArchived?: boolean;
}): Promise<Client[]> {
  let query = supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (!opts?.includeArchived) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  let results = (data ?? []) as Client[];

  if (opts?.search?.trim()) {
    const s = opts.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.company?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s)
    );
  }

  return results;
}

export async function getClient(clientId: string): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (error) throw error;
  return data as Client;
}

export async function createClient(input: ClientInsert): Promise<Client> {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...input, org_id: orgId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function updateClient(
  clientId: string,
  input: ClientUpdate
): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .update(input as any)
    .eq("id", clientId)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function archiveClient(clientId: string): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ is_active: false } as any)
    .eq("id", clientId);
  if (error) throw error;
}

export async function restoreClient(clientId: string): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ is_active: true } as any)
    .eq("id", clientId);
  if (error) throw error;
}

/** Link a job to a client profile */
export async function linkJobToClient(
  jobId: string,
  clientId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("invoices")
    .update({ client_id: clientId } as any)
    .eq("job_id", jobId);
  if (error && error.code !== "PGRST116") {
    // ignore "0 rows" errors
  }

  if (clientId) {
    const client = await getClient(clientId);
    await supabase
      .from("jobs")
      .update({
        client_company: client.company || client.name,
        client_name: client.name,
        client_email: client.email,
      } as any)
      .eq("id", jobId);
  }
}

export async function getClientStats(): Promise<{
  total: number;
  active: number;
  archived: number;
}> {
  const [totalRes, activeRes] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  const total = totalRes.count ?? 0;
  const active = activeRes.count ?? 0;
  return { total, active, archived: total - active };
}
