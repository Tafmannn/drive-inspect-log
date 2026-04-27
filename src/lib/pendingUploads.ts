// src/lib/pendingUploads.ts
// Local-first photo upload queue for Axentra inspections.
//
// ─── Submission-session state machine ────────────────────────────────
// Every queued item belongs to a submission session and progresses
// through an explicit lifecycle:
//
//   staged   → created during a submit attempt; NEVER uploadable.
//   ready    → atomically promoted by the InspectionFlow only AFTER:
//                (a) the server submit_inspection RPC committed AND
//                (b) the client successfully patched inspectionId /
//                    damageItemId / submissionSessionId onto every
//                    item in the session.
//              Only ready items are processed by the upload worker.
//   uploading → transient, set by retryUpload while in flight.
//   uploaded  → terminal success; fileBlob cleared to reclaim quota.
//   failed    → terminal-for-now; can be retried by the user.
//
// Hard rules enforced here:
//   1. Workers (retryUpload / retryAllPending / retryJobUploads) only
//      ever touch items in state === "ready" or "failed". staged items
//      are never picked up.
//   2. discardSubmissionSession() removes ALL items for a given session.
//      Used by InspectionFlow when staging fails, when the submit RPC
//      fails after staging, or when linkage patching fails.
//   3. Stale-staged TTL: items left in "staged" longer than
//      STAGED_TTL_MS are auto-purged on every queue load. This protects
//      against app crash / reload mid-flow leaving zombie staged items
//      that could otherwise be promoted manually.
//
// Backwards compatibility:
//   - Legacy items without a `state` field are treated as "ready"
//     (they were created before the state machine existed and were
//     therefore already eligible for upload under the old contract).
//   - The legacy `status` field is preserved for the Pending Uploads
//     screen ("pending" / "failed" / "done") and is derived from `state`.
//
// Storage: IndexedDB (via idb-keyval). Photos are stored as raw Blobs.

import { get, set, del, createStore } from "idb-keyval";
import { storageService } from "./storage";
import { insertPhoto } from "./api";
import { logClientEvent } from "./logger";
import { notifyEvidenceQueueChanged } from "./evidenceQueueBus";
import type {
  InspectionType,
  PhotoType,
  StorageBackend,
} from "./types";

const QUEUE_KEY = "queue";
const store = createStore("axentra-pending-uploads", "v2");

// One-time migration flag from legacy localStorage queue.
const LEGACY_LOCALSTORAGE_KEY = "axentra.pendingUploads.v1";
const MIGRATION_FLAG_KEY = "_migrated_from_v1";

/** Legacy status surface, derived from `state` for the Pending Uploads UI. */
export type PendingUploadStatus = "pending" | "uploading" | "failed" | "done";

/**
 * Lifecycle state of a queued photo. See module docstring for the full
 * state-machine contract. Workers MUST refuse to upload anything that
 * is not in "ready" state.
 */
export type PendingUploadState =
  | "staged"
  | "ready"
  | "uploading"
  | "uploaded"
  | "failed"
  /**
   * "blocked" — the worker could not verify the job's current_run_id and
   * the queued item carries a runId. Refusing to upload protects against
   * attaching evidence to a reopened (newer) run. Surfaces in Pending
   * Uploads with a clear reason; user can retry once connectivity
   * returns or the job is reachable again.
   */
  | "blocked";

/**
 * Stale-staged TTL. Items left in "staged" longer than this are purged
 * on every queue load. Keeps zombie sessions from a mid-flow crash from
 * silently being promotable.
 *
 * 30 minutes is generous enough to cover a slow signature upload + RPC
 * round-trip on a poor mobile connection, while ensuring abandoned
 * sessions don't accumulate.
 */
export const STAGED_TTL_MS = 30 * 60 * 1000;

export interface PendingUpload {
  id: string;
  jobId: string;
  inspectionType: InspectionType;
  photoType: PhotoType | string;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Legacy status — derived from `state`. Kept for UI compatibility. */
  status: PendingUploadStatus;
  /**
   * Authoritative lifecycle state. Workers MUST only process "ready"
   * (and "failed" on user-initiated retry).
   */
  state: PendingUploadState;
  errorMessage?: string | null;

  /**
   * Raw image blob, kept until the upload succeeds.
   * Cleared (set to null) after a successful upload to reclaim quota.
   */
  fileBlob: Blob | null;
  fileName: string;

  inspectionId?: string | null;
  backend?: StorageBackend;
  backendRef?: string | null;
  jobNumber?: string | null;
  vehicleReg?: string | null;
  damageItemId?: string | null;

  /**
   * Job's `current_run_id` at the time this photo was queued.
   * The retry worker compares to job's *current* run before uploading.
   */
  runId?: string | null;

  /**
   * The submission-session UUID this item was staged under. Items
   * carrying the same session id are atomically promoted from
   * "staged" → "ready" (or atomically discarded). Required for
   * server-side rollback compensation.
   */
  submissionSessionId?: string | null;

  /**
   * Stable client-generated id for this captured photo. Survives
   * across submit attempts so the InspectionFlow can correlate
   * server-returned damageItemIds back to the queued item.
   */
  clientPhotoId?: string | null;

  /**
   * For damage close-up photos, the client-generated tempId of the
   * damage entry. Used to map server-returned damageItemIds onto
   * the right queue item during the linkage patch step.
   */
  clientDamageId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// concurrency lock — prevents duplicate uploads of the same item
// ─────────────────────────────────────────────────────────────

const inFlight = new Set<string>();

// ─────────────────────────────────────────────────────────────
// IndexedDB helpers
// ─────────────────────────────────────────────────────────────

/**
 * Normalise a row read from disk to the current shape. Backfills the
 * `state` field for legacy items: anything that isn't already
 * uploaded/failed is treated as "ready" so existing in-flight queues
 * keep working after the upgrade.
 */
function normaliseRow(raw: any): PendingUpload {
  if (!raw) return raw;
  if (raw.state) return raw as PendingUpload;
  // Legacy migration path
  let state: PendingUploadState;
  switch (raw.status) {
    case "done":
      state = "uploaded";
      break;
    case "failed":
      state = "failed";
      break;
    case "uploading":
      state = "uploading";
      break;
    default:
      state = "ready";
  }
  return { ...(raw as PendingUpload), state };
}

async function loadAllRaw(): Promise<PendingUpload[]> {
  await migrateLegacyIfNeeded();
  try {
    const data = (await get<PendingUpload[]>(QUEUE_KEY, store)) ?? [];
    if (!Array.isArray(data)) return [];
    return data.map(normaliseRow);
  } catch (e) {
    console.warn("[pendingUploads] Failed to read queue from IDB", e);
    return [];
  }
}

/**
 * Public load. Auto-purges stale "staged" items (TTL expired) on every
 * read so workers cannot inadvertently promote zombie sessions.
 */
async function loadAll(): Promise<PendingUpload[]> {
  const all = await loadAllRaw();
  const now = Date.now();
  const stale: PendingUpload[] = [];
  const survivors: PendingUpload[] = [];
  for (const u of all) {
    if (u.state === "staged") {
      const age = now - new Date(u.createdAt).getTime();
      if (age > STAGED_TTL_MS) {
        stale.push(u);
        continue;
      }
    }
    survivors.push(u);
  }
  if (stale.length > 0) {
    try {
      await saveAll(survivors);
    } catch {
      /* ignore */
    }
    void logClientEvent("pending_upload_staged_purged", "warn", {
      source: "storage",
      type: "upload",
      context: {
        purgedCount: stale.length,
        sessions: Array.from(
          new Set(stale.map((u) => u.submissionSessionId ?? "(none)")),
        ),
        reason: "stale_staged_ttl_exceeded",
      },
    });
  }
  return survivors;
}

async function saveAll(items: PendingUpload[]): Promise<void> {
  await set(QUEUE_KEY, items, store);
}

async function updateOne(
  id: string,
  updater: (item: PendingUpload) => PendingUpload,
): Promise<PendingUpload | null> {
  const all = await loadAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const updated = updater(all[idx]);
  all[idx] = updated;
  try {
    await saveAll(all);
  } catch {
    // best-effort
  }
  return updated;
}

async function removeOne(id: string): Promise<void> {
  const all = await loadAll();
  const next = all.filter((u) => u.id !== id);
  try {
    await saveAll(next);
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Image compression — produces a Blob, not a data URL
// ─────────────────────────────────────────────────────────────

const MAX_PHOTO_DIMENSION = 1920;
const JPEG_QUALITY = 0.75;

async function compressToBlob(file: File): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(
          MAX_PHOTO_DIMENSION / img.width,
          MAX_PHOTO_DIMENSION / img.height,
          1,
        );
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas toBlob returned null"));
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fall back to the raw file if it can't be decoded for compression
      resolve(file);
    };
    img.src = objectUrl;
  });
}

// ─────────────────────────────────────────────────────────────
// One-time migration from legacy localStorage queue
// ─────────────────────────────────────────────────────────────

let migrationPromise: Promise<void> | null = null;

async function migrateLegacyIfNeeded(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      const flag = await get<boolean>(MIGRATION_FLAG_KEY, store);
      if (flag) return;

      if (typeof window === "undefined") {
        await set(MIGRATION_FLAG_KEY, true, store);
        return;
      }

      const raw = window.localStorage?.getItem(LEGACY_LOCALSTORAGE_KEY);
      if (!raw) {
        await set(MIGRATION_FLAG_KEY, true, store);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
        await set(MIGRATION_FLAG_KEY, true, store);
        return;
      }

      const migrated: PendingUpload[] = [];
      for (const legacy of parsed) {
        try {
          const dataUrl: string | null = legacy?.fileDataUrl ?? null;
          let blob: Blob | null = null;
          if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
            const [header, b64] = dataUrl.split(",");
            const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            blob = new Blob([bytes], { type: mime });
          }
          migrated.push({
            id: legacy.id,
            jobId: legacy.jobId,
            inspectionType: legacy.inspectionType,
            photoType: legacy.photoType,
            label: legacy.label ?? null,
            createdAt: legacy.createdAt,
            completedAt: legacy.completedAt ?? null,
            status: legacy.status ?? "pending",
            state: legacy.status === "done" ? "uploaded" : "ready",
            errorMessage: legacy.errorMessage ?? null,
            fileBlob: blob,
            fileName: `${legacy.id}.jpg`,
            inspectionId: legacy.inspectionId ?? null,
            backend: legacy.backend,
            backendRef: legacy.backendRef ?? null,
            jobNumber: legacy.jobNumber ?? null,
            vehicleReg: legacy.vehicleReg ?? null,
            damageItemId: legacy.damageItemId ?? null,
          });
        } catch {
          // Skip un-migratable entries rather than break the whole migration
        }
      }

      if (migrated.length > 0) {
        await set(QUEUE_KEY, migrated, store);
      }
      window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      await set(MIGRATION_FLAG_KEY, true, store);
    } catch (e) {
      console.warn("[pendingUploads] Legacy migration failed", e);
      try {
        await set(MIGRATION_FLAG_KEY, true, store);
      } catch {
        /* ignore */
      }
    }
  })();
  return migrationPromise;
}

// ─────────────────────────────────────────────────────────────
// public API — staging + session lifecycle
// ─────────────────────────────────────────────────────────────

/**
 * Stage a photo into the queue under a submission session. The item is
 * created in state "staged" and is NOT uploadable until promoted via
 * promoteSubmissionSession(). Throws if the IDB write fails so callers
 * can roll back the staging attempt.
 */
export async function stagePendingUpload(
  file: File,
  args: {
    submissionSessionId: string;
    clientPhotoId: string;
    clientDamageId?: string | null;
    jobId: string;
    inspectionType: InspectionType;
    photoType: PhotoType | string;
    label: string | null;
    jobNumber?: string | null;
    vehicleReg?: string | null;
    runId?: string | null;
  },
): Promise<PendingUpload> {
  const blob = await compressToBlob(file);

  const id =
    "pu_" +
    (crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2));

  const item: PendingUpload = {
    id,
    jobId: args.jobId,
    inspectionType: args.inspectionType,
    photoType: args.photoType,
    label: args.label ?? null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    status: "pending",
    state: "staged",
    errorMessage: null,
    fileBlob: blob,
    fileName: file.name || `${id}.jpg`,
    inspectionId: null,
    jobNumber: args.jobNumber ?? null,
    vehicleReg: args.vehicleReg ?? null,
    damageItemId: null,
    runId: args.runId ?? null,
    submissionSessionId: args.submissionSessionId,
    clientPhotoId: args.clientPhotoId,
    clientDamageId: args.clientDamageId ?? null,
  };

  const all = await loadAll();
  all.push(item);
  // Intentionally let the underlying IDB error propagate so the caller
  // can detect quota/blocked/private-mode failures and roll back.
  await saveAll(all);
  return item;
}

/**
 * Atomically apply a linkage patch to every item in a submission
 * session and promote them from "staged" → "ready". Returns the count
 * of items promoted. If any patch lookup fails, no items are promoted
 * (the caller should then call discardSubmissionSession).
 */
export async function promoteSubmissionSession(
  submissionSessionId: string,
  patch: {
    inspectionId: string;
    /** Map of clientDamageId → server damage_items.id */
    damageIdMap: Record<string, string>;
  },
): Promise<{ promoted: number }> {
  const all = await loadAll();
  const targets = all.filter(
    (u) =>
      u.submissionSessionId === submissionSessionId && u.state === "staged",
  );
  if (targets.length === 0) {
    return { promoted: 0 };
  }

  // Validation pass: every damage close-up MUST resolve to a server id.
  // If even one cannot resolve, refuse to promote any of them. The
  // caller is then expected to discard the session and trigger
  // server-side rollback.
  for (const t of targets) {
    if (t.photoType === "damage_close_up" && t.clientDamageId) {
      const serverId = patch.damageIdMap[t.clientDamageId];
      if (!serverId) {
        throw new Error(
          `LINKAGE_PATCH_FAILED: no server damage id for clientDamageId=${t.clientDamageId}`,
        );
      }
    }
  }

  const next = all.map((u) => {
    if (
      u.submissionSessionId !== submissionSessionId ||
      u.state !== "staged"
    ) {
      return u;
    }
    const damageItemId =
      u.photoType === "damage_close_up" && u.clientDamageId
        ? patch.damageIdMap[u.clientDamageId] ?? null
        : null;
    return {
      ...u,
      inspectionId: patch.inspectionId,
      damageItemId,
      state: "ready" as PendingUploadState,
      status: "pending" as PendingUploadStatus,
    };
  });

  await saveAll(next);
  notifyEvidenceQueueChanged();
  return { promoted: targets.length };
}

/**
 * Remove every item belonging to a submission session, regardless of
 * state. Used to roll back a failed submit attempt so no orphaned
 * staged items can survive to be uploaded later.
 */
export async function discardSubmissionSession(
  submissionSessionId: string,
): Promise<{ discarded: number }> {
  const all = await loadAll();
  const survivors = all.filter(
    (u) => u.submissionSessionId !== submissionSessionId,
  );
  const discarded = all.length - survivors.length;
  if (discarded > 0) {
    try {
      await saveAll(survivors);
    } catch {
      /* ignore */
    }
    notifyEvidenceQueueChanged();
  }
  return { discarded };
}

// ─────────────────────────────────────────────────────────────
// Legacy shim removed.
//
// Earlier versions exported `addPendingUpload(file, args)` which created
// items directly in state="ready", bypassing the staging contract. That
// path is incompatible with the per-submission rollback model and is no
// longer reachable from any caller in the codebase. The canonical entry
// points are:
//   - stagePendingUpload(...)
//   - promoteSubmissionSession(...)
//   - discardSubmissionSession(...)
// ─────────────────────────────────────────────────────────────

export async function getAllPendingUploads(): Promise<PendingUpload[]> {
  return loadAll();
}

export async function deletePendingUpload(id: string): Promise<void> {
  await removeOne(id);
  notifyEvidenceQueueChanged();
}

/**
 * Remove all "uploaded" (legacy: "done") items to reclaim space.
 */
export async function pruneDone(): Promise<void> {
  const all = await loadAll();
  const next = all.filter(
    (u) => u.state !== "uploaded" && u.status !== "done",
  );
  if (next.length === all.length) return;
  try {
    await saveAll(next);
  } catch {
    /* ignore */
  }
  notifyEvidenceQueueChanged();
}

/**
 * Remove queued uploads whose `runId` no longer matches the job's
 * `current_run_id`. Returns count purged.
 */
export async function purgeStaleRunUploads(): Promise<number> {
  const all = await loadAll();
  const itemsWithRun = all.filter((u) => u.runId);
  if (itemsWithRun.length === 0) return 0;

  const jobIds = Array.from(new Set(itemsWithRun.map((u) => u.jobId)));
  const { supabase } = await import("@/integrations/supabase/client");

  const { data, error } = await supabase
    .from("jobs")
    .select("id, current_run_id")
    .in("id", jobIds);
  if (error) {
    return 0;
  }
  const currentRunByJob = new Map<string, string | null>();
  for (const row of data ?? [])
    currentRunByJob.set(row.id, (row as any).current_run_id ?? null);

  const survivors: PendingUpload[] = [];
  let purged = 0;
  for (const u of all) {
    if (!u.runId) {
      survivors.push(u);
      continue;
    }
    const current = currentRunByJob.get(u.jobId);
    if (!current || current !== u.runId) {
      void logClientEvent("photo_upload_failed", "warn", {
        jobId: u.jobId,
        source: "storage",
        type: "upload",
        context: {
          reason: "stale_run_purged",
          pendingId: u.id,
          queuedRun: u.runId,
          currentRun: current ?? null,
        },
      });
      purged++;
      continue;
    }
    survivors.push(u);
  }

  if (purged > 0) {
    try {
      await saveAll(survivors);
    } catch {
      /* ignore */
    }
    notifyEvidenceQueueChanged();
  }
  return purged;
}

/**
 * Worker entrypoint: upload a single queued item.
 * HARD GUARD: refuses to upload items not in state "ready" or "failed".
 * This is the central enforcement point for the staging contract — if
 * a staged item somehow ends up here, it is left untouched.
 */
export async function retryUpload(
  id: string,
  _options?: { timeoutMs?: number },
): Promise<boolean> {
  if (inFlight.has(id)) return false;
  inFlight.add(id);

  try {
    // Snapshot the candidate first so we can enforce the state guard.
    const before = await loadAll();
    const candidate = before.find((u) => u.id === id);
    if (!candidate) return false;

    // STAGED items are NEVER uploadable. This is the central guarantee
    // that a failed submit cannot leak orphan evidence.
    // Allowed entry states for a worker pass: "ready" (normal queue),
    // "failed" (user-initiated retry), "blocked" (run unverified — user
    // or background retry attempting to re-verify).
    if (
      candidate.state === "staged" ||
      candidate.state === "uploading" ||
      candidate.state === "uploaded"
    ) {
      return false;
    }

    // Run-id verification. We compare the queued runId to the job's
    // current_run_id and branch into three outcomes:
    //   • matches → continue with upload, passing runId to insertPhoto.
    //   • differs (job has been reopened) → purge; the stale evidence
    //     must NEVER attach to the new run.
    //   • cannot verify (network/RLS) → mark "blocked" instead of
    //     uploading. The item stays in IDB and is surfaced in Pending
    //     Uploads with a clear reason. The user can retry later.
    let verifiedRunId: string | null = null;
    if (candidate.runId) {
      let currentRun: string | null = null;
      let verifyFailed = false;
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data, error } = await supabase
          .from("jobs")
          .select("current_run_id")
          .eq("id", candidate.jobId)
          .maybeSingle();
        if (error) throw error;
        currentRun = (data as any)?.current_run_id ?? null;
      } catch (e) {
        verifyFailed = true;
        void logClientEvent("photo_upload_failed", "warn", {
          jobId: candidate.jobId,
          source: "storage",
          type: "upload",
          context: {
            reason: "run_verify_failed",
            pendingId: id,
            queuedRun: candidate.runId,
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }

      if (!verifyFailed && currentRun && currentRun === candidate.runId) {
        verifiedRunId = candidate.runId;
      } else if (!verifyFailed) {
        // Definitive mismatch (or job has no current_run_id at all):
        // purge — evidence must not attach to a different run.
        void logClientEvent("photo_upload_failed", "warn", {
          jobId: candidate.jobId,
          source: "storage",
          type: "upload",
          context: {
            reason: "stale_run_purged",
            pendingId: id,
            queuedRun: candidate.runId,
            currentRun,
          },
        });
        await removeOne(id);
        notifyEvidenceQueueChanged();
        return false;
      } else {
        // Verification failed — keep the item, mark blocked, surface to user.
        await updateOne(id, (u) => ({
          ...u,
          state: "blocked",
          status: "failed",
          errorMessage:
            "Run unverified — left queued. Will retry once the job is reachable.",
        }));
        notifyEvidenceQueueChanged();
        return false;
      }
    }

    const existing = await updateOne(id, (u) => ({
      ...u,
      state: "uploading",
      status: "uploading",
      errorMessage: null,
    }));

    if (!existing) return false;

    if (!existing.fileBlob) {
      await updateOne(id, (u) => ({
        ...u,
        state: "uploaded",
        status: "done",
        completedAt: u.completedAt ?? new Date().toISOString(),
        errorMessage: null,
      }));
      return true;
    }

    const file = new File([existing.fileBlob], existing.fileName, {
      type: existing.fileBlob.type || "image/jpeg",
    });

    const stored = await storageService.uploadImage(
      file,
      `jobs/${existing.jobId}/${existing.inspectionType}/${existing.photoType}/${existing.id}`,
    );

    // Pass the verified runId straight through. insertPhoto preserves it
    // verbatim when supplied (caller-provided values bypass the lookup).
    // If the queue item carries no runId at all (legacy pre-runId queue),
    // we omit the field and let insertPhoto resolve it server-side; that
    // resolution path now fails-safe with RUN_UNVERIFIED if the job has
    // no current_run_id.
    const photoPayload: any = {
      job_id: existing.jobId,
      inspection_id: existing.inspectionId ?? null,
      type: existing.photoType,
      url: stored.url,
      thumbnail_url: stored.thumbnailUrl ?? null,
      backend: stored.backend,
      backend_ref: stored.backendRef ?? null,
      label: existing.label,
    };
    if (verifiedRunId) {
      photoPayload.run_id = verifiedRunId;
    }
    await insertPhoto(photoPayload);

    if (existing.photoType === "damage_close_up" && existing.damageItemId) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase
          .from("damage_items")
          .update({ photo_url: stored.url })
          .eq("id", existing.damageItemId);
      } catch {
        // best-effort
      }
    }

    await updateOne(id, (u) => ({
      ...u,
      state: "uploaded",
      status: "done",
      completedAt: new Date().toISOString(),
      errorMessage: null,
      fileBlob: null,
      backend: stored.backend,
      backendRef: stored.backendRef ?? null,
    }));
    notifyEvidenceQueueChanged();

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";

    await updateOne(id, (u) => ({
      ...u,
      state: "failed",
      status: "failed",
      errorMessage: msg,
    }));
    notifyEvidenceQueueChanged();

    const all = await loadAll();
    const item = all.find((u) => u.id === id);
    void logClientEvent("photo_upload_failed", "error", {
      jobId: item?.jobId,
      source: "storage",
      type: "upload",
      context: { pendingId: id, error: msg },
    });

    return false;
  } finally {
    inFlight.delete(id);
  }
}

export async function retryAllPending(options?: {
  timeoutMs?: number;
}): Promise<{ succeeded: number; failed: number; purged: number }> {
  const purged = await purgeStaleRunUploads().catch(() => 0);

  const all = await loadAll();
  // STAGED items are NEVER picked up by the worker — they are not
  // "uploadable" until promoteSubmissionSession() flips them to ready.
  const targets = all.filter(
    (u) => u.state === "ready" || u.state === "failed" || u.state === "blocked",
  );

  let succeeded = 0;
  let failed = 0;

  for (const u of targets) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await retryUpload(u.id, options);
    if (ok) succeeded++;
    else failed++;
  }

  return { succeeded, failed, purged };
}

// ─────────────────────────────────────────────────────────────
// Job-level grouping
// ─────────────────────────────────────────────────────────────

export interface JobUploadSummary {
  jobId: string;
  jobNumber: string | null;
  vehicleReg: string | null;
  pendingCount: number;
  failedCount: number;
  lastErrorAt: string | null;
}

export async function getPendingUploadsByJob(): Promise<JobUploadSummary[]> {
  // Only "ready" + "failed" surface to the user. "staged" items are
  // an internal in-flight state and must not be displayed as pending
  // uploads (they would be misleading — they cannot be uploaded).
  const all = (await loadAll()).filter(
    (u) => u.state === "ready" || u.state === "failed" || u.state === "blocked",
  );

  const map = new Map<string, JobUploadSummary>();

  for (const u of all) {
    let entry = map.get(u.jobId);
    if (!entry) {
      entry = {
        jobId: u.jobId,
        jobNumber: u.jobNumber ?? null,
        vehicleReg: u.vehicleReg ?? null,
        pendingCount: 0,
        failedCount: 0,
        lastErrorAt: null,
      };
      map.set(u.jobId, entry);
    }

    if (u.state === "ready") entry.pendingCount++;
    // "blocked" surfaces as failed in the UI so it gets visible attention.
    if (u.state === "failed" || u.state === "blocked") {
      entry.failedCount++;
      if (u.errorMessage) {
        const errTime = u.completedAt || u.createdAt;
        if (!entry.lastErrorAt || errTime > entry.lastErrorAt) {
          entry.lastErrorAt = errTime;
        }
      }
    }
  }

  return Array.from(map.values());
}

export async function getPendingJobCount(): Promise<number> {
  return (await getPendingUploadsByJob()).length;
}

export async function retryJobUploads(
  jobId: string,
): Promise<{ succeeded: number; failed: number }> {
  const all = await loadAll();
  const targets = all.filter(
    (u) =>
      u.jobId === jobId && (u.state === "ready" || u.state === "failed"),
  );

  let succeeded = 0;
  let failed = 0;

  for (const u of targets) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await retryUpload(u.id);
    if (ok) succeeded++;
    else failed++;
  }

  return { succeeded, failed };
}

// Internal: exposed only for tests
export const __testing__ = {
  loadAll,
  saveAll,
  store,
  QUEUE_KEY,
  STAGED_TTL_MS,
};
