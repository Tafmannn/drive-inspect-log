/**
 * Evidence queue runtime — app-level singleton wiring.
 *
 * Owns the one EvidenceUploadQueue instance (real Supabase transport + app
 * logger) and the browser triggers that drain it (online / focus /
 * visibilitychange / boot), mirroring installSubmitQueueDrainer.
 *
 * The drain runs UNCONDITIONALLY of the EVIDENCE_V2_ENABLED flag: the flag
 * gates capture only, so turning it off never strands already-queued items.
 */

import { logClientEvent } from "@/lib/logger";
import { EvidenceUploadQueue, type DrainResult } from "./uploadQueue";
import { SupabaseEvidenceTransport } from "./transport";
import type { EvidenceLogger } from "./types";

const appLogger: EvidenceLogger = {
  event(name, level, data) {
    void logClientEvent(name, level, {
      source: "storage",
      type: "upload",
      context: data,
      jobId: typeof data?.jobId === "string" ? data.jobId : undefined,
    });
  },
};

let queue: EvidenceUploadQueue | null = null;

function getQueue(): EvidenceUploadQueue {
  if (!queue) queue = new EvidenceUploadQueue(new SupabaseEvidenceTransport(), appLogger);
  return queue;
}

/** Drain all eligible evidence uploads. Safe to call from anywhere, anytime. */
export function drainEvidenceQueue(): Promise<DrainResult> {
  return getQueue().drain();
}

/** Install global drain triggers. Returns a cleanup fn (App-level, once). */
export function installEvidenceDrainTriggers(): () => void {
  if (typeof window === "undefined") return () => {};

  const tryDrain = () => { void drainEvidenceQueue(); };
  const onVisibility = () => {
    if (document.visibilityState === "visible") tryDrain();
  };

  window.addEventListener("online", tryDrain);
  window.addEventListener("focus", tryDrain);
  document.addEventListener("visibilitychange", onVisibility);
  tryDrain(); // boot drain — resumes any queue from a prior session

  return () => {
    window.removeEventListener("online", tryDrain);
    window.removeEventListener("focus", tryDrain);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
