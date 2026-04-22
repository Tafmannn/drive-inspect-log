// src/lib/retryOrchestrator.ts
//
// Centralised trigger surface for the background uploader.
//
// In a field app the uploader cannot rely on a single page-load tick.
// We must re-attempt pending uploads when the environment becomes
// favourable again:
//   • app/auth becomes ready (handled by <BackgroundUploader/>)
//   • browser comes back online
//   • tab becomes visible again
//   • driver explicitly retries from a job context
//
// Hard rules (preserved from the staging contract):
//   - Only ready/failed items are ever processed (enforced inside
//     pendingUploads.retryAllPending → retryUpload state guard).
//   - Staged items are NEVER touched.
//   - Triggers are de-duped by an in-memory single-flight latch and a
//     small jitter window so a "wake storm" (online+visibility firing
//     together) cannot spam the queue.
//
// Return contract:
//   triggerRetry returns a structured outcome so manual callers (e.g.
//   the Pending Uploads screen) can give honest user feedback instead of
//   pretending a no-op was a successful retry.

import { retryAllPending } from "./pendingUploads";
import { logClientEvent } from "./logger";

export type RetryTrigger =
  | "auth_ready"
  | "online"
  | "visibility"
  | "manual"
  | "interval";

export type RetryOutcome =
  | "completed"
  | "skipped_inflight"
  | "skipped_backoff"
  | "failed";

export interface RetryResult {
  outcome: RetryOutcome;
  succeeded: number;
  failed: number;
  purged: number;
  /** Milliseconds until the backoff window clears (only set on skipped_backoff). */
  retryAfterMs?: number;
  /** Error message when outcome === "failed". */
  error?: string;
}

let inFlight = false;
let lastFiredAt = 0;
const MIN_INTERVAL_MS = 4_000; // jitter floor — avoid back-to-back storms

/**
 * Run a queue retry pass, de-duped against concurrent triggers and a
 * small minimum interval. Safe to call from any event source.
 *
 * Returns a structured RetryResult so callers can surface honest UX.
 */
export async function triggerRetry(source: RetryTrigger): Promise<RetryResult> {
  const now = Date.now();
  if (inFlight) {
    return { outcome: "skipped_inflight", succeeded: 0, failed: 0, purged: 0 };
  }
  const sinceLast = now - lastFiredAt;
  if (sinceLast < MIN_INTERVAL_MS) {
    return {
      outcome: "skipped_backoff",
      succeeded: 0,
      failed: 0,
      purged: 0,
      retryAfterMs: MIN_INTERVAL_MS - sinceLast,
    };
  }

  inFlight = true;
  lastFiredAt = now;

  // Tiny randomised delay to spread out simultaneous triggers (e.g.
  // online + visibilitychange both firing on resume).
  const jitter = Math.floor(Math.random() * 750);
  await new Promise((r) => setTimeout(r, jitter));

  try {
    const result = await retryAllPending();
    if (
      result.succeeded > 0 ||
      result.failed > 0 ||
      result.purged > 0
    ) {
      void logClientEvent("pending_upload_retry", "info", {
        source: "storage",
        type: "upload",
        context: { trigger: source, ...result },
      });
    }
    return {
      outcome: "completed",
      succeeded: result.succeeded,
      failed: result.failed,
      purged: result.purged,
    };
  } catch (err) {
    const message = (err as Error)?.message ?? "unknown_error";
    void logClientEvent("pending_upload_retry_failed", "warn", {
      source: "storage",
      type: "upload",
      context: { trigger: source, error: message },
    });
    return {
      outcome: "failed",
      succeeded: 0,
      failed: 0,
      purged: 0,
      error: message,
    };
  } finally {
    inFlight = false;
  }
}

/**
 * Install global event listeners so the queue retries automatically
 * when the device/network/app state recovers. Returns a cleanup fn.
 *
 * Idempotent at the module level: if called twice, the second call's
 * cleanup will still detach correctly because each call binds its own
 * listener references.
 */
export function installRetryTriggers(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => { void triggerRetry("online"); };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      void triggerRetry("visibility");
    }
  };
  const onFocus = () => { void triggerRetry("visibility"); };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
  };
}

/** Test-only helper to reset internal latches between tests. */
export function __resetRetryOrchestratorForTests(): void {
  inFlight = false;
  lastFiredAt = 0;
}
