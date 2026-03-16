// src/lib/logger.ts
// Lightweight client-side event logging to Supabase client_logs table.
// Best-effort only — never crashes the app.

import { supabase } from "@/integrations/supabase/client";

export type LogSeverity = "info" | "warn" | "error";

export type LogSource = "ui" | "api" | "edge" | "db" | "storage" | "sheets" | "unknown";
export type LogType = "auth" | "rls" | "dvla" | "company" | "sheets" | "upload" | "jobs" | "users" | "routing" | "unknown";

interface LogOptions {
  jobId?: string;
  userId?: string;
  orgId?: string;
  message?: string;
  context?: Record<string, unknown>;
  source?: LogSource;
  type?: LogType;
}

const E2E_TEST_MODE =
  typeof import.meta !== "undefined" &&
  (import.meta.env.VITE_E2E_TEST_MODE as string | undefined) === "true";

/**
 * Log a client event. In E2E_TEST_MODE, also persists to client_logs.
 * Always logs to console in dev.
 */
export async function logClientEvent(
  event: string,
  severity: LogSeverity = "info",
  options: LogOptions = {},
): Promise<void> {
  try {
    const { jobId, message, context, source, type } = options;

    // Auto-resolve userId from session if not provided
    let userId = options.userId ?? null;
    let orgId = options.orgId ?? null;
    if (!userId || !orgId) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          userId = userId ?? data.session.user.id;
          orgId = orgId ?? data.session.user.app_metadata?.org_id ?? data.session.user.user_metadata?.org_id ?? null;
        }
      } catch {
        // best-effort
      }
    }

    // Always log to console in dev or test mode
    if (import.meta.env.DEV || E2E_TEST_MODE) {
      const tag = `[${severity.toUpperCase()}] [${source ?? "unknown"}/${type ?? "unknown"}]`;
      const method = severity === "error" ? console.error : severity === "warn" ? console.warn : console.log;
      method(tag, event, message ?? "", context ?? "");
    }

    // Always persist to client_logs (best-effort)
    await supabase.from("client_logs").insert({
      event,
      severity,
      job_id: jobId ?? null,
      user_id: userId ?? null,
      message: message ?? null,
      context: {
        ...((context as Record<string, unknown>) ?? {}),
        source: source ?? "unknown",
        type: type ?? "unknown",
      },
    } as any);
  } catch {
    // best-effort only — never break the app for logging
  }
}

/**
 * Capture unhandled promise rejections and errors globally
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (e) => {
    logClientEvent("unhandled_promise_rejection", "error", {
      message: e.reason?.message ?? String(e.reason),
      source: "ui",
      type: "unknown",
      context: { stack: e.reason?.stack?.slice(0, 500) },
    });
  });

  window.addEventListener("error", (e) => {
    logClientEvent("uncaught_error", "error", {
      message: e.message,
      source: "ui",
      type: "unknown",
      context: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    });
  });
}

/** Check if E2E test mode is active */
export function isE2ETestMode(): boolean {
  return E2E_TEST_MODE;
}
