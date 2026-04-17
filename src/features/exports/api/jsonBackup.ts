/**
 * Full JSON backup of org-scoped operational data.
 * RLS ensures admins see their org only; super admins see all.
 */

import { supabase } from "@/integrations/supabase/client";
import { downloadJson } from "./csvWriter";

interface BackupResult {
  generatedAt: string;
  counts: Record<string, number>;
}

export async function exportJsonBackup(): Promise<BackupResult> {
  const [
    jobsRes,
    inspectionsRes,
    photosRes,
    expensesRes,
    invoicesRes,
    clientsRes,
    damageItemsRes,
  ] = await Promise.all([
    supabase.from("jobs").select("*").limit(20000),
    supabase.from("inspections").select("*").limit(20000),
    supabase.from("photos").select("*").limit(50000),
    supabase.from("expenses").select("*").limit(20000),
    supabase.from("invoices").select("*").limit(10000),
    supabase.from("clients").select("*").limit(5000),
    supabase.from("damage_items").select("*").limit(20000),
  ]);

  const errors = [jobsRes, inspectionsRes, photosRes, expensesRes, invoicesRes, clientsRes, damageItemsRes]
    .map((r) => r.error)
    .filter(Boolean);
  if (errors.length) throw new Error(errors.map((e) => e!.message).join("; "));

  const payload = {
    generatedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    jobs: jobsRes.data ?? [],
    inspections: inspectionsRes.data ?? [],
    photos: photosRes.data ?? [],
    expenses: expensesRes.data ?? [],
    invoices: invoicesRes.data ?? [],
    clients: clientsRes.data ?? [],
    damage_items: damageItemsRes.data ?? [],
  };

  const counts = {
    jobs: payload.jobs.length,
    inspections: payload.inspections.length,
    photos: payload.photos.length,
    expenses: payload.expenses.length,
    invoices: payload.invoices.length,
    clients: payload.clients.length,
    damage_items: payload.damage_items.length,
  };

  downloadJson(payload, `axentra-backup-${new Date().toISOString().slice(0, 10)}.json`);

  return { generatedAt: payload.generatedAt, counts };
}
