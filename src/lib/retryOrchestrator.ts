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

import { retryAllPending } from "./pendingUploads";
import { logClientEvent } from "./logger";

export type RetryTrigger =
  | "auth_ready"
  | "online"
  | "visibility"
  | "manual"
  | "interval";

let inFlight = false;
let lastFiredAt = 0;
const MIN_INTERVAL_MS = 4_000; // jitter floor — avoid back-to-back storms

/**
 * Run a queue retry pass, de-duped against concurrent triggers and a
 * small minimum interval. Safe to call from any event source.
 */
export async function triggerRetry(source: RetryTrigger): Promise<void> {
  const now = Date.now();
  if (inFlight) return;
  if (now - lastFiredAt < MIN_INTERVAL_MS) return;

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
  } catch (err) {
    void logClientEvent("pending_upload_retry_failed", "warn", {
      source: "storage",
      type: "upload",
      context: { trigger: source, error: (err as Error)?.message },
    });
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
