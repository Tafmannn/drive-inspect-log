/**
 * Nudge the notify-customers edge function to send any queued
 * "collected" / "delivered" customer emails.
 *
 * The queue itself is written by a database trigger when a job's status
 * changes, so nothing here decides what to send; this only prompts the
 * sender. Fire-and-forget and best-effort: it never throws and never blocks
 * the caller. A missed nudge is picked up by the next one (any inspection
 * submit, or an admin opening the Command Center overview).
 */
import { supabase } from "@/integrations/supabase/client";

const MIN_INTERVAL_MS = 15_000;
let lastKick = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

function invoke(): void {
  lastKick = Date.now();
  void supabase.functions.invoke("notify-customers", { body: {} }).catch(() => {});
}

/**
 * Ask the sender to run. Calls within MIN_INTERVAL_MS of the last one are
 * coalesced into a single trailing call, so a burst of submits (e.g. an
 * offline queue draining) produces at most two requests.
 */
export function kickCustomerNotifications(): void {
  try {
    const wait = lastKick + MIN_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      invoke();
      return;
    }
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      invoke();
    }, wait);
  } catch {
    /* notifications are never critical */
  }
}

/** Test hook. */
export function __resetCustomerNotifyThrottle(): void {
  lastKick = 0;
  if (pending) clearTimeout(pending);
  pending = null;
}
