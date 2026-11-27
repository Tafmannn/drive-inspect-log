/**
 * Ids of clients who invoice themselves (clients.billing_method = 'self_billed').
 *
 * Reads with select("*") so it works both before and after the billing_method column
 * exists (before: nobody is self-billing). A failed read throws: callers that count
 * unbilled work must not silently count a self-billing client's jobs as owed by us —
 * nor hide ours.
 */
import { supabase } from "@/integrations/supabase/client";
import { isSelfBilled } from "./billingMethod";

export async function fetchSelfBilledClientIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("clients").select("*");
  if (error) throw new Error(`Could not check which clients invoice themselves: ${error.message}`);
  return new Set(
    ((data ?? []) as { id: string; billing_method?: unknown }[]).filter(isSelfBilled).map((c) => c.id),
  );
}
