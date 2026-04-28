// src/lib/submitQueue.ts
//
// Offline-capable inspection submit queue.
//
// ─── Why this exists ────────────────────────────────────────────────
// `pendingUploads` already makes captured PHOTOS resilient to network
// drops: after the `submit_inspection` RPC commits, photos are
// promoted to "ready" and a background worker retries them until they
// reach the server.
//
// What was *not* resilient was the RPC itself. If the network dropped
// during signature upload or during the RPC round-trip, the entire
// submit aborted with a "Submission failed" toast and the driver had
// to manually re-tap Submit Report once they were back online.
//
// This module fixes that. When the driver taps Submit while offline
// (or the submit fails with a network-class error), we durably
// persist the FULL submission — inspection payload, damage items,
// signature blobs, and the staged-photo session id — to IndexedDB,
// then return the form to the job. As soon as the device is back
// online (`installSubmitQueueDrainer` listens for `online` /
// `visibilitychange` / app focus), the queue is drained: signatures
// upload, the RPC fires (idempotent on `submission_session_id`), and
// the staged photos in `pendingUploads` are promoted + uploaded by
// the existing background worker.
//
// ─── Hard guarantees ────────────────────────────────────────────────
//   1. The submit RPC is idempotent on `submission_session_id` (see
//      migration `20260428081956_…`). A queue replay after a network
//      timeout never creates a duplicate inspection row.
//   2. Photos staged for a queued submission stay in IndexedDB under
//      the same `submissionSessionId` until the RPC succeeds — they
//      are then promoted via `promoteSubmissionSession` and become
//      eligible for the upload worker.
//   3. If a queued submission's RPC permanently fails (e.g. server
//      raises INSPECTION_ALREADY_SUBMITTED for a different reason),
//      the entry is retained with `status: "failed"` and the photos
//      are NOT promoted — the driver can review it from Pending
//      Uploads and discard if needed. We never silently throw
//      evidence away.
//   4. Workers refuse to drain if `navigator.onLine === false` to
//      avoid wasted retry storms when we know we're offline.

import { get, set, createStore } from "idb-keyval";
import { useSyncExternalStore } from "react";

import { storageService } from "./storage";
import {
  promoteSubmissionSession,
  type PendingUpload,
} from "./pendingUploads";
import { logClientEvent } from "./logger";
import { supabase } from "@/integrations/supabase/client";
import type { InspectionType, Inspection, DamageItem } from "./types";

const QUEUE_KEY = "submitQueue";
const store = createStore("axentra-submit-queue", "v1");

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type SubmitQueueStatus = "queued" | "submitting" | "failed";

/**
 * A queued submission entry. Note the signatures are stored as raw
 * Blobs — they are not yet uploaded when this entry is created
 * (signature upload happens during drain, after the device is back
 * online). The `stagedPhotoMappings` lets us correlate the queued
 * photos in `pendingUploads` (still in state="staged") to the damage
 * items returned by the RPC, so we can patch + promote them.
 */
export interface QueuedSubmission {
  /** Stable id for this queue entry (NOT the same as submissionSessionId). */
  id: string;
  /** RPC idempotency key — written through to inspections.submission_session_id. */
  submissionSessionId: string;
  jobId: string;
  /** Pretty job number for UI display ("Job AX0123"). */
  jobNumber: string | null;
  vehicleReg: string | null;
  inspectionType: InspectionType;
  /** Job's `current_run_id` at queue time. */
  runId: string | null;

  /** Serializable inspection payload (no Files / Blobs). */
  inspectionPayload: Partial<Inspection>;
  /** Serializable damage-items payload (no Files / Blobs). */
  damageItems: Array<Omit<DamageItem, "id" | "inspection_id" | "created_at">>;

  /**
   * Raw signature blobs captured at submit time. Uploaded during
   * drain, then their resulting URLs are written into
   * `inspectionPayload.driver_signature_url` / `customer_signature_url`
   * before the RPC fires.
   *
   * `null` when no signature was captured (e.g. some delivery flows
   * may not require a customer signature).
   */
  driverSignatureBlob: Blob | null;
  customerSignatureBlob: Blob | null;
  /** Once a signature is uploaded during drain we cache the URL here so a partial drain doesn't re-upload it. */
  driverSignatureUrl: string | null;
  customerSignatureUrl: string | null;

  /**
   * Maps the staged photo's `clientDamageId` (set by InspectionFlow
   * when staging) → its position in `damageItems[]`. After the RPC
   * returns `damageItemIds`, we use this index to build the patch
   * map for `promoteSubmissionSession`.
   */
  damageClientIdOrder: string[];

  status: SubmitQueueStatus;
  attempts: number;
  /** Last failure message; cleared on a successful drain. */
  lastError: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp of the most recent drain attempt. */
  lastAttemptAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Pub/sub bus — lets UI surfaces (PendingUploads) re-render on change.
// ─────────────────────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();

const CHANNEL_NAME = "axentra-submit-queue";
type Channel = { postMessage: (msg: unknown) => void; close: () => void };
let channel: Channel | null = null;

function getChannel(): Channel | null {
  if (channel) return channel;
  if (typeof window === "undefined") return null;
  const BC = (window as unknown as { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel;
  if (!BC) return null;
  try {
    const bc = new BC(CHANNEL_NAME);
    bc.onmessage = () => bumpLocal();
    channel = bc as unknown as Channel;
    return channel;
  } catch {
    return null;
  }
}

function bumpLocal(): void {
  version++;
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

function notifyChanged(): void {
  bumpLocal();
  const ch = getChannel();
  if (ch) {
    try { ch.postMessage({ t: Date.now() }); } catch { /* ignore */ }
  }
}

export function useSubmitQueueVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      getChannel();
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}

// ─────────────────────────────────────────────────────────────────────
// IDB primitives
// ─────────────────────────────────────────────────────────────────────

async function loadAllRaw(): Promise<QueuedSubmission[]> {
  try {
    const data = (await get<QueuedSubmission[]>(QUEUE_KEY, store)) ?? [];
    if (!Array.isArray(data)) return [];
    return data;
  } catch (e) {
    console.warn("[submitQueue] read failed", e);
    return [];
  }
}

async function saveAll(items: QueuedSubmission[]): Promise<void> {
  await set(QUEUE_KEY, items, store);
}

export async function loadAllSubmissions(): Promise<QueuedSubmission[]> {
  return loadAllRaw();
}

async function updateOne(
  id: string,
  updater: (q: QueuedSubmission) => QueuedSubmission,
): Promise<QueuedSubmission | null> {
  const all = await loadAllRaw();
  const idx = all.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  all[idx] = updater(all[idx]);
  await saveAll(all);
  notifyChanged();
  return all[idx];
}

async function removeOne(id: string): Promise<void> {
  const all = await loadAllRaw();
  const next = all.filter((q) => q.id !== id);
  await saveAll(next);
  notifyChanged();
}

// ─────────────────────────────────────────────────────────────────────
// Public: enqueue
// ─────────────────────────────────────────────────────────────────────

export interface EnqueueArgs {
  submissionSessionId: string;
  jobId: string;
  jobNumber: string | null;
  vehicleReg: string | null;
  inspectionType: InspectionType;
  runId: string | null;
  inspectionPayload: Partial<Inspection>;
  damageItems: Array<Omit<DamageItem, "id" | "inspection_id" | "created_at">>;
  driverSignatureBlob: Blob | null;
  customerSignatureBlob: Blob | null;
  driverSignatureUrl: string | null;
  customerSignatureUrl: string | null;
  damageClientIdOrder: string[];
}

export async function enqueueSubmission(
  args: EnqueueArgs,
): Promise<QueuedSubmission> {
  const id =
    "sq_" +
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2));

  const entry: QueuedSubmission = {
    id,
    submissionSessionId: args.submissionSessionId,
    jobId: args.jobId,
    jobNumber: args.jobNumber,
    vehicleReg: args.vehicleReg,
    inspectionType: args.inspectionType,
    runId: args.runId,
    inspectionPayload: args.inspectionPayload,
    damageItems: args.damageItems,
    driverSignatureBlob: args.driverSignatureBlob,
    customerSignatureBlob: args.customerSignatureBlob,
    driverSignatureUrl: args.driverSignatureUrl,
    customerSignatureUrl: args.customerSignatureUrl,
    damageClientIdOrder: args.damageClientIdOrder,
    status: "queued",
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
  };

  const all = await loadAllRaw();
  all.push(entry);
  // Let IDB errors propagate so the caller can surface a storage failure.
  await saveAll(all);
  notifyChanged();

  void logClientEvent("submit_queue_enqueued", "info", {
    jobId: args.jobId,
    source: "storage",
    type: "upload",
    context: {
      submissionSessionId: args.submissionSessionId,
      inspectionType: args.inspectionType,
      damageCount: args.damageItems.length,
    },
  });

  return entry;
}

export async function discardSubmission(id: string): Promise<void> {
  await removeOne(id);
}

// ─────────────────────────────────────────────────────────────────────
// Drain
// ─────────────────────────────────────────────────────────────────────

let draining = false;

export interface DrainResult {
  attempted: number;
  succeeded: number;
  failed: number;
  /** True if drain was skipped because the device is offline / no auth. */
  skipped: boolean;
  reason?: string;
}

/**
 * Process every queued submission. Returns counts so callers can
 * surface user-friendly toasts. Single-flight: concurrent calls
 * collapse to the first one (later callers get an immediate
 * "skipped" result). Re-entrant safe across `online`/`focus`/manual
 * triggers.
 */
export async function drainSubmitQueue(): Promise<DrainResult> {
  if (draining) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: true, reason: "in_flight" };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: true, reason: "offline" };
  }

  draining = true;
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const all = await loadAllRaw();
    const candidates = all.filter((q) => q.status === "queued" || q.status === "failed");

    for (const entry of candidates) {
      attempted++;
      try {
        await drainOne(entry);
        succeeded++;
      } catch (e) {
        failed++;
        const message = e instanceof Error ? e.message : String(e);
        await updateOne(entry.id, (q) => ({
          ...q,
          status: "failed",
          attempts: q.attempts + 1,
          lastError: message,
          lastAttemptAt: new Date().toISOString(),
        }));
        void logClientEvent("submit_queue_drain_failed", "error", {
          jobId: entry.jobId,
          source: "storage",
          type: "upload",
          message,
          context: {
            submissionSessionId: entry.submissionSessionId,
            attempts: entry.attempts + 1,
          },
        });
      }
    }
  } finally {
    draining = false;
  }

  return { attempted, succeeded, failed, skipped: false };
}

async function drainOne(entry: QueuedSubmission): Promise<void> {
  // Mark in flight so the UI can show a spinner if it wants to.
  await updateOne(entry.id, (q) => ({
    ...q,
    status: "submitting",
    lastAttemptAt: new Date().toISOString(),
  }));

  // ── 1) Upload signatures if not already done ──
  let driverSignatureUrl = entry.driverSignatureUrl;
  let customerSignatureUrl = entry.customerSignatureUrl;

  if (!driverSignatureUrl && entry.driverSignatureBlob) {
    const file = blobToFile(entry.driverSignatureBlob, "driver.png");
    const result = await storageService.uploadImage(
      file,
      `jobs/${entry.jobId}/signatures/${entry.inspectionType}/driver`,
    );
    driverSignatureUrl = result.url;
    // Persist incrementally so a crash mid-drain doesn't lose progress.
    await updateOne(entry.id, (q) => ({ ...q, driverSignatureUrl }));
  }

  if (!customerSignatureUrl && entry.customerSignatureBlob) {
    const file = blobToFile(entry.customerSignatureBlob, "customer.png");
    const result = await storageService.uploadImage(
      file,
      `jobs/${entry.jobId}/signatures/${entry.inspectionType}/customer`,
    );
    customerSignatureUrl = result.url;
    await updateOne(entry.id, (q) => ({ ...q, customerSignatureUrl }));
  }

  // ── 2) Fire the RPC. Idempotent on submission_session_id. ──
  const inspectionPayload: Partial<Inspection> = {
    ...entry.inspectionPayload,
    driver_signature_url: driverSignatureUrl ?? entry.inspectionPayload.driver_signature_url ?? null,
    customer_signature_url: customerSignatureUrl ?? entry.inspectionPayload.customer_signature_url ?? null,
  };

  const { data, error } = await (supabase as any).rpc("submit_inspection", {
    p_job_id: entry.jobId,
    p_type: entry.inspectionType,
    p_inspection: inspectionPayload as any,
    p_damage_items: entry.damageItems as any,
    p_submission_session_id: entry.submissionSessionId,
  });

  if (error) throw error;

  const result = (data ?? {}) as {
    inspectionId: string;
    damageItemIds?: string[];
    idempotentReplay?: boolean;
  };
  const inspectionId = result.inspectionId;
  const damageItemIds = result.damageItemIds ?? [];

  if (!inspectionId) {
    throw new Error("RPC returned no inspectionId");
  }

  // ── 3) Promote any staged photos for this session → ready ──
  const damageIdMap: Record<string, string> = {};
  entry.damageClientIdOrder.forEach((cid, idx) => {
    const sid = damageItemIds[idx];
    if (cid && sid) damageIdMap[cid] = sid;
  });

  await promoteSubmissionSession(entry.submissionSessionId, {
    inspectionId,
    damageIdMap,
  });

  // ── 4) Done — remove from the queue. ──
  await removeOne(entry.id);

  void logClientEvent("submit_queue_drained", "info", {
    jobId: entry.jobId,
    source: "storage",
    type: "upload",
    context: {
      submissionSessionId: entry.submissionSessionId,
      idempotentReplay: !!result.idempotentReplay,
      attempts: entry.attempts + 1,
    },
  });

  // Kick the photo retry worker right away so promoted photos start
  // uploading without waiting for the next online/focus event.
  try {
    const m = await import("./retryOrchestrator");
    void m.triggerRetry("manual");
  } catch {
    /* best-effort */
  }
}

function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/png" });
}

// ─────────────────────────────────────────────────────────────────────
// Network classifier — exported so InspectionFlow can decide whether
// to enqueue a failed submit vs surface a hard error.
// ─────────────────────────────────────────────────────────────────────

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const name = (err as { name?: string } | null)?.name?.toLowerCase() ?? "";
  const msg = (
    err instanceof Error ? err.message : typeof err === "string" ? err : ""
  ).toLowerCase();
  if (name === "typeerror" && msg.includes("fetch")) return true;
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("offline")
  );
}

// ─────────────────────────────────────────────────────────────────────
// Drainer install (App-level)
// ─────────────────────────────────────────────────────────────────────

/**
 * Install drain triggers. Returns a cleanup fn. Mirrors
 * `installRetryTriggers` from `retryOrchestrator` so they can run
 * side-by-side.
 */
export function installSubmitQueueDrainer(): () => void {
  if (typeof window === "undefined") return () => {};

  const tryDrain = () => { void drainSubmitQueue(); };
  const onVisibility = () => {
    if (document.visibilityState === "visible") tryDrain();
  };

  window.addEventListener("online", tryDrain);
  window.addEventListener("focus", tryDrain);
  document.addEventListener("visibilitychange", onVisibility);

  // Initial drain on install — covers the case where the app boots
  // online and there's a queue from a prior session.
  tryDrain();

  return () => {
    window.removeEventListener("online", tryDrain);
    window.removeEventListener("focus", tryDrain);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

// ─────────────────────────────────────────────────────────────────────
// Test-only helpers
// ─────────────────────────────────────────────────────────────────────

export async function __resetSubmitQueueForTests(): Promise<void> {
  await saveAll([]);
  version = 0;
  listeners.clear();
  draining = false;
}

/** Unused import guard so tree-shakers keep the type. */
export type __PendingUploadType = PendingUpload;
