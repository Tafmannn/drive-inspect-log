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

  // Client-side search (name, company, email)
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
  // Silently skip if no invoice exists yet — we update client_company on job directly
  if (error && error.code !== "PGRST116") {
    // ignore "0 rows" errors
  }

  // Also set client_company + client_name + client_email on the job for display
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

/** Get client count stats */
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
