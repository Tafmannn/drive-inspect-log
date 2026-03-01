// src/lib/logger.ts
// Lightweight client-side event logging to Supabase client_logs table.
// Best-effort only — never crashes the app.

import { supabase } from "@/integrations/supabase/client";

export type LogSeverity = "info" | "warn" | "error";

interface LogOptions {
  jobId?: string;
  userId?: string;
  message?: string;
  context?: Record<string, unknown>;
}

export async function logClientEvent(
  event: string,
  severity: LogSeverity = "info",
  options: LogOptions = {},
): Promise<void> {
  try {
    const { jobId, userId, message, context } = options;
    await supabase.from("client_logs").insert({
      event,
      severity,
      job_id: jobId ?? null,
      user_id: userId ?? null,
      message: message ?? null,
      context: context ?? null,
    } as any);
  } catch {
    // best-effort only — never break the app for logging
  }
}
