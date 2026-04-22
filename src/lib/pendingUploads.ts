// src/lib/pendingUploads.ts
// Local-first photo upload queue for Axentra inspections.
//
// Storage: IndexedDB (via idb-keyval). Photos are stored as raw Blobs which
// is dramatically more space-efficient than base64 in localStorage and gives
// us tens of MB of headroom on mobile browsers vs ~5 MB previously.
//
// Public API (signatures preserved for backward compatibility):
//   - addPendingUpload(file, args)          -> Promise<PendingUpload>
//   - getAllPendingUploads()                -> Promise<PendingUpload[]>
//   - deletePendingUpload(id)               -> Promise<void>
//   - retryUpload(id, opts?)                -> Promise<boolean>
//   - retryAllPending(opts?)                -> Promise<{succeeded, failed}>
//   - retryJobUploads(jobId)                -> Promise<{succeeded, failed}>
//   - getPendingUploadsByJob()              -> Promise<JobUploadSummary[]>
//   - getPendingJobCount()                  -> Promise<number>
//   - pruneDone()                           -> Promise<void>

import { get, set, del, createStore } from "idb-keyval";
import { storageService } from "./storage";
import { insertPhoto } from "./api";
import { logClientEvent } from "./logger";
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

export type PendingUploadStatus = "pending" | "uploading" | "failed" | "done";

export interface PendingUpload {
  id: string;
  jobId: string;
  inspectionType: InspectionType;
  photoType: PhotoType | string;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
  status: PendingUploadStatus;
  errorMessage?: string | null;

  /**
   * Raw image blob, kept until the upload succeeds.
   * Cleared (set to null) after a successful upload to reclaim quota.
   * Stored as a Blob in IndexedDB — structured-clone supports this natively.
   */
  fileBlob: Blob | null;

  /**
   * Original filename, used to reconstruct a File on retry.
   */
  fileName: string;

  inspectionId?: string | null;
  backend?: StorageBackend;
  backendRef?: string | null;
  jobNumber?: string | null;
  vehicleReg?: string | null;
  damageItemId?: string | null;

  /**
   * The job's `current_run_id` at the time this photo was queued.
   * The retry worker compares this to the job's *current* run before
   * uploading. If they don't match the photo belongs to a previous
   * run (e.g. job was reopened) and is purged instead of uploaded so
   * stale evidence cannot leak into the new active run.
   */
  runId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// concurrency lock — prevents duplicate uploads of the same item
// ─────────────────────────────────────────────────────────────

const inFlight = new Set<string>();

// ─────────────────────────────────────────────────────────────
// IndexedDB helpers
// ─────────────────────────────────────────────────────────────

async function loadAll(): Promise<PendingUpload[]> {
  await migrateLegacyIfNeeded();
  try {
    const data = (await get<PendingUpload[]>(QUEUE_KEY, store)) ?? [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[pendingUploads] Failed to read queue from IDB", e);
    return [];
  }
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
// public API
// ─────────────────────────────────────────────────────────────

export async function addPendingUpload(
  file: File,
  args: {
    jobId: string;
    inspectionType: InspectionType;
    photoType: PhotoType | string;
    label: string | null;
    inspectionId?: string | null;
    jobNumber?: string | null;
    vehicleReg?: string | null;
    damageItemId?: string | null;
    /**
     * Job's current run id when the photo was captured. Required for
     * run isolation — if omitted the retry worker will treat the item
     * as run-less and still attempt upload, but reopened jobs may then
     * receive stale evidence. Always pass `job.current_run_id` here.
     */
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
    errorMessage: null,
    fileBlob: blob,
    fileName: file.name || `${id}.jpg`,
    inspectionId: args.inspectionId ?? null,
    jobNumber: args.jobNumber ?? null,
    vehicleReg: args.vehicleReg ?? null,
    damageItemId: args.damageItemId ?? null,
    runId: args.runId ?? null,
  };

  const all = await loadAll();
  all.push(item);
  try {
    await saveAll(all);
  } catch (e) {
    throw new Error(
      "Could not save photo to local queue. Please retry pending uploads or free device storage.",
    );
  }
  return item;
}

export async function getAllPendingUploads(): Promise<PendingUpload[]> {
  return loadAll();
}

export async function deletePendingUpload(id: string): Promise<void> {
  await removeOne(id);
}

/**
 * Remove all "done" items to reclaim space.
 */
export async function pruneDone(): Promise<void> {
  const all = await loadAll();
  const next = all.filter((u) => u.status !== "done");
  try {
    await saveAll(next);
  } catch {
    /* ignore */
  }
}

/**
 * Remove queued uploads whose `runId` no longer matches the job's
 * `current_run_id`. This is the run-isolation safety net: when an
 * admin reopens a job a fresh `current_run_id` is generated, and
 * any photo still queued from the previous run must NOT upload —
 * it would attach evidence to the new active run and pollute the
 * POD record. Called opportunistically before retries and exposed
 * for the Pending Uploads screen.
 *
 * Items with no `runId` (legacy queue entries from before this
 * field existed) are left alone — purging them would silently
 * destroy in-flight evidence on a normal upgrade.
 *
 * Returns the count of items purged.
 */
export async function purgeStaleRunUploads(): Promise<number> {
  const all = await loadAll();
  const itemsWithRun = all.filter((u) => u.runId);
  if (itemsWithRun.length === 0) return 0;

  const jobIds = Array.from(new Set(itemsWithRun.map((u) => u.jobId)));
  const { supabase } = await import("@/integrations/supabase/client");

  // Fetch current run for each affected job in a single round-trip.
  const { data, error } = await supabase
    .from("jobs")
    .select("id, current_run_id")
    .in("id", jobIds);
  if (error) {
    // Don't drop items on transient errors — better to retry next time
    // than to silently destroy a valid queued photo.
    return 0;
  }
  const currentRunByJob = new Map<string, string | null>();
  for (const row of data ?? []) currentRunByJob.set(row.id, (row as any).current_run_id ?? null);

  const survivors: PendingUpload[] = [];
  let purged = 0;
  for (const u of all) {
    if (!u.runId) {
      survivors.push(u);
      continue;
    }
    const current = currentRunByJob.get(u.jobId);
    // If the job no longer exists treat as stale.
    if (!current || current !== u.runId) {
      void logClientEvent("photo_upload_failed", "warn", {
        jobId: u.jobId,
        source: "storage",
        type: "upload",
        context: { reason: "stale_run_purged", pendingId: u.id, queuedRun: u.runId, currentRun: current ?? null },
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
  }
  return purged;
}

export async function retryUpload(
  id: string,
  _options?: { timeoutMs?: number },
): Promise<boolean> {
  if (inFlight.has(id)) return false;
  inFlight.add(id);

  try {
    // Run-isolation gate: never upload a photo whose runId no longer
    // matches the job's current_run_id. Treat as a soft-failed item
    // that was permanently invalidated by a reopen — it gets removed
    // entirely so it cannot be retried.
    const before = await loadAll();
    const candidate = before.find((u) => u.id === id);
    if (candidate?.runId) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("jobs")
          .select("current_run_id")
          .eq("id", candidate.jobId)
          .maybeSingle();
        const currentRun = (data as any)?.current_run_id ?? null;
        if (!currentRun || currentRun !== candidate.runId) {
          void logClientEvent("photo_upload_failed", "warn", {
            jobId: candidate.jobId,
            source: "storage",
            type: "upload",
            context: { reason: "stale_run_purged", pendingId: id, queuedRun: candidate.runId, currentRun },
          });
          await removeOne(id);
          return false;
        }
      } catch {
        // If we can't verify, fall through to normal retry — better
        // to attempt the upload than silently lose evidence.
      }
    }

    const existing = await updateOne(id, (u) => ({
      ...u,
      status: "uploading",
      errorMessage: null,
    }));

    if (!existing) return false;

    if (!existing.fileBlob) {
      await updateOne(id, (u) => ({
        ...u,
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

    await insertPhoto({
      job_id: existing.jobId,
      inspection_id: existing.inspectionId ?? null,
      type: existing.photoType,
      url: stored.url,
      thumbnail_url: stored.thumbnailUrl ?? null,
      backend: stored.backend,
      backend_ref: stored.backendRef ?? null,
      label: existing.label,
    });

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
      status: "done",
      completedAt: new Date().toISOString(),
      errorMessage: null,
      fileBlob: null,
      backend: stored.backend,
      backendRef: stored.backendRef ?? null,
    }));

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";

    await updateOne(id, (u) => ({
      ...u,
      status: "failed",
      errorMessage: msg,
    }));

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
  // Run-isolation safety net: drop items whose run no longer matches
  // the job's current run before attempting any uploads.
  const purged = await purgeStaleRunUploads().catch(() => 0);

  const all = await loadAll();
  const targets = all.filter(
    (u) => u.status === "pending" || u.status === "failed",
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
  const all = (await loadAll()).filter(
    (u) => u.status === "pending" || u.status === "failed",
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

    if (u.status === "pending") entry.pendingCount++;
    if (u.status === "failed") {
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
      u.jobId === jobId &&
      (u.status === "pending" || u.status === "failed"),
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
};
