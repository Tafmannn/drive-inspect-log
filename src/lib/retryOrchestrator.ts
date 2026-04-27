// src/lib/retryOrchestrator.ts
//
// Single retry contract for the background uploader, with scoped
// concurrency + scoped cooldown so manual user actions stay responsive
// while background triggers stay storm-protected.
//
// ─── Concurrency model ──────────────────────────────────────────────
//
//   Global lock      → held by background sources + Retry All. While
//                      held, no other global retry runs and no new
//                      manual-job retry will start (a global pass may
//                      already be uploading items for that job).
//
//   Per-job lock     → held by manual_job retries. Independent per job
//                      id, so manual retries on Job A never block
//                      manual retries on Job B and never block / are
//                      blocked by an unrelated background cooldown.
//
//   A manual-job retry is only blocked by:
//     • a currently-running global retry (true conflict), OR
//     • a currently-running manual retry on the SAME job.
//   It is NEVER blocked by background cooldown.
//
// ─── Cooldown model ─────────────────────────────────────────────────
//
//   Background sources (auth_ready / online / visibility / focus) and
//   manual_all share a global anti-storm cooldown so reconnect storms
//   don't spam the worker. Manual-job has NO cooldown — drivers
//   tapping "Retry" on a single job get an immediate response.
//
// ─── Hard rules preserved from the staging contract ────────────────
//   - Only ready/failed items are ever processed (enforced inside
//     pendingUploads.retryAllPending / retryJobUploads via the
//     retryUpload state guard).
//   - Staged items are NEVER touched.
//
// Determinism for tests: sleep + jitter helpers are injectable so
// tests can drive timing without real waits. Production behaviour is
// unchanged.

import { retryAllPending, retryJobUploads } from "./pendingUploads";
import { logClientEvent } from "./logger";

export type RetryTrigger =
  | "auth_ready"
  | "online"
  | "visibility"
  | "focus"
  | "manual"      // legacy alias kept for callers — treated as manual_all
  | "manual_all"
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

// ─── Lock state ─────────────────────────────────────────────────────
let globalInFlight = false;
let lastGlobalAt = 0;
const perJobInFlight = new Set<string>();

const GLOBAL_COOLDOWN_MS = 4_000; // anti-storm floor for global path

/**
 * Sources that participate in the global cooldown. Manual-job is
 * deliberately excluded so a driver tap is always immediate.
 */
function usesGlobalCooldown(source: RetryTrigger): boolean {
  return (
    source === "auth_ready" ||
    source === "online" ||
    source === "visibility" ||
    source === "focus" ||
    source === "manual" ||
    source === "manual_all" ||
    source === "interval"
  );
}

// ─── Injectable timing (for deterministic tests) ────────────────────
type Sleep = (ms: number) => Promise<void>;
type JitterMs = () => number;

let sleepImpl: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// NOTE: Math.random is acceptable here — used only for retry backoff jitter
// (timing decorrelation under load). Not an ID, token, or security value.
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
 * Run a queue retry pass with scope-aware concurrency + cooldown.
 *
 *   • jobId omitted → global pass (Retry All / background).
 *     Held under the global lock + global cooldown.
 *
 *   • jobId provided → per-job manual pass.
 *     Held under a per-job lock. Bypasses global cooldown but is still
 *     blocked by an in-flight global pass (true conflict) or another
 *     in-flight retry on the same job.
 */
export async function triggerRetry(
  source: RetryTrigger,
  jobId?: string,
): Promise<RetryResult> {
  const now = Date.now();
  const isPerJob = !!jobId;

  if (isPerJob) {
    // True conflict: a global retry is currently uploading items —
    // could touch this job's items too. Refuse to double-process.
    if (globalInFlight) {
      return { outcome: "skipped_inflight", succeeded: 0, failed: 0, purged: 0 };
    }
    if (perJobInFlight.has(jobId!)) {
      return { outcome: "skipped_inflight", succeeded: 0, failed: 0, purged: 0 };
    }
    perJobInFlight.add(jobId!);
  } else {
    if (globalInFlight) {
      return { outcome: "skipped_inflight", succeeded: 0, failed: 0, purged: 0 };
    }
    if (usesGlobalCooldown(source)) {
      const sinceLast = now - lastGlobalAt;
      if (sinceLast < GLOBAL_COOLDOWN_MS) {
        return {
          outcome: "skipped_backoff",
          succeeded: 0,
          failed: 0,
          purged: 0,
          retryAfterMs: GLOBAL_COOLDOWN_MS - sinceLast,
        };
      }
    }
    globalInFlight = true;
    lastGlobalAt = now;
  }

  // Tiny randomised delay to spread out simultaneous triggers (e.g.
  // online + visibilitychange both firing on resume). Injectable for
  // deterministic tests. Per-job paths still benefit from a small
  // spread when many jobs are tapped in quick succession.
  await sleepImpl(jitterImpl());

  try {
    const result = isPerJob
      ? { ...(await retryJobUploads(jobId!)), purged: 0 }
      : await retryAllPending();

    if (result.succeeded > 0 || result.failed > 0 || result.purged > 0) {
      void logClientEvent("pending_upload_retry", "info", {
        source: "storage",
        type: "upload",
        context: { trigger: source, jobId: jobId ?? null, ...result },
      });
      // Note: queue-mutation broadcast is now emitted from the
      // pendingUploads lifecycle layer itself, so badges refresh
      // regardless of which entry point ran the retry.
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
    if (isPerJob) {
      perJobInFlight.delete(jobId!);
    } else {
      globalInFlight = false;
    }
  }
}

/**
 * Install global event listeners so the queue retries automatically
 * when the device/network/app state recovers. Returns a cleanup fn.
 *
 * `focus` is logged separately from `visibility` so telemetry can
 * tell tab-switch resume from window-focus resume.
 */
export function installRetryTriggers(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => { void triggerRetry("online"); };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      void triggerRetry("visibility");
    }
  };
  const onFocus = () => { void triggerRetry("focus"); };

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
  globalInFlight = false;
  lastGlobalAt = 0;
  perJobInFlight.clear();
  sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms));
  jitterImpl = () => Math.floor(Math.random() * 750);
}
