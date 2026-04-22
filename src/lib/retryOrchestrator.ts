// src/lib/retryOrchestrator.ts
//
// Single retry contract for the background uploader.
//
// All retry entry points (background triggers, manual "Retry All" tap,
// per-job "Retry" tap) flow through this module so they share:
//   - the same single-flight latch (no duplicate concurrent passes)
//   - the same backoff floor (no reconnect storms)
//   - the same structured outcome model (honest UX)
//   - the same structured logging
//
// Hard rules preserved from the staging contract:
//   - Only ready/failed items are ever processed (enforced inside
//     pendingUploads.retryAllPending / retryJobUploads via the
//     retryUpload state guard).
//   - Staged items are NEVER touched.
//
// Determinism for tests:
//   The sleep + jitter helpers are injectable so tests can drive
//   timing without real waits. Production behaviour is unchanged.

import { retryAllPending, retryJobUploads } from "./pendingUploads";
import { logClientEvent } from "./logger";
import { notifyEvidenceQueueChanged } from "./evidenceQueueBus";

export type RetryTrigger =
  | "auth_ready"
  | "online"
  | "visibility"
  | "manual"
  | "manual_job"
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
  /** Milliseconds until the backoff window clears (only on skipped_backoff). */
  retryAfterMs?: number;
  /** Error message when outcome === "failed". */
  error?: string;
}

let inFlight = false;
let lastFiredAt = 0;
const MIN_INTERVAL_MS = 4_000; // jitter floor — avoid back-to-back storms

// ─── Injectable timing (for deterministic tests) ────────────────────
type Sleep = (ms: number) => Promise<void>;
type JitterMs = () => number;

let sleepImpl: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let jitterImpl: JitterMs = () => Math.floor(Math.random() * 750);

/**
 * Test hook: replace the sleep + jitter implementations so retry
 * pacing becomes deterministic. Production code never calls this.
 */
export function __setRetryTimingForTests(opts: {
  sleep?: Sleep;
  jitter?: JitterMs;
}): void {
  if (opts.sleep) sleepImpl = opts.sleep;
  if (opts.jitter) jitterImpl = opts.jitter;
}

/**
 * Run a queue retry pass, de-duped against concurrent triggers and a
 * small minimum interval. Safe to call from any event source.
 *
 * If `jobId` is provided, only that job's items are retried (per-job
 * Retry button). Otherwise the full queue is processed.
 *
 * Both paths share single-flight + backoff + outcome model so the UI
 * cannot lie about what happened.
 */
export async function triggerRetry(
  source: RetryTrigger,
  jobId?: string,
): Promise<RetryResult> {
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
  // online + visibilitychange both firing on resume). Injectable for
  // deterministic tests.
  await sleepImpl(jitterImpl());

  try {
    const result = jobId
      ? { ...(await retryJobUploads(jobId)), purged: 0 }
      : await retryAllPending();

    if (result.succeeded > 0 || result.failed > 0 || result.purged > 0) {
      void logClientEvent("pending_upload_retry", "info", {
        source: "storage",
        type: "upload",
        context: { trigger: source, jobId: jobId ?? null, ...result },
      });
      // Notify any mounted EvidenceStatusBadges to re-read the queue.
      notifyEvidenceQueueChanged();
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
      context: { trigger: source, jobId: jobId ?? null, error: message },
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
  sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms));
  jitterImpl = () => Math.floor(Math.random() * 750);
}
