// src/lib/pendingUploads.ts
// Local-first photo upload queue for Axentra inspections.
// Stores images in localStorage while offline / low signal,
// then replays them to Supabase (and Google Drive if configured).

import { storageService } from "./storage";
import { insertPhoto } from "./api";
import { logClientEvent } from "./logger";
import type {
  InspectionType,
  PhotoType,
  StorageBackend,
} from "./types";

const STORAGE_KEY = "axentra.pendingUploads.v1";

export type PendingUploadStatus = "pending" | "uploading" | "failed" | "done";

export interface PendingUpload {
  id: string;
  jobId: string;
  inspectionType: InspectionType;
  photoType: PhotoType | string;
  label: string | null;
  createdAt: string;
  completedAt: string | null; // set when status transitions to "done"
  status: PendingUploadStatus;
  errorMessage?: string | null;

  // Local-only data for reconstructing the file.
  // Stripped from the record after a successful upload to reclaim localStorage quota.
  fileDataUrl: string | null;

  // Optional metadata that can be attached later
  inspectionId?: string | null;
  backend?: StorageBackend;
  backendRef?: string | null;
  jobNumber?: string | null;
  vehicleReg?: string | null;
  damageItemId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// in-memory upload lock — prevents duplicate concurrent uploads
// for the same pending item (e.g. manual retry + auto-retry race)
// ─────────────────────────────────────────────────────────────

const inFlight = new Set<string>();

// ─────────────────────────────────────────────────────────────
// internal storage helpers
// ─────────────────────────────────────────────────────────────

function safeGetStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadAll(): PendingUpload[] {
  const storage = safeGetStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Validate: if corrupted (not an array), clear and return empty
    if (!Array.isArray(parsed)) {
      console.warn("[pendingUploads] Corrupt queue data (not an array) — clearing.");
      storage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed as PendingUpload[];
  } catch {
    return [];
  }
}

/**
 * Measure byte size of the current queue in localStorage.
 */
function getStorageUsageBytes(): number {
  const storage = safeGetStorage();
  if (!storage) return 0;
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? new Blob([raw]).size : 0;
}

const MAX_QUEUE_BYTES = 3.5 * 1024 * 1024; // 3.5 MB — headroom for other storage

/**
 * Persist the queue. Throws if localStorage is unavailable or over quota —
 * callers that enqueue new items should propagate this so the UI can warn
 * the user rather than silently losing the upload.
 */
function saveAll(items: PendingUpload[]): void {
  const storage = safeGetStorage();
  if (!storage) throw new Error("localStorage unavailable");
  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function updateOne(
  id: string,
  updater: (item: PendingUpload) => PendingUpload,
): PendingUpload | null {
  const all = loadAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const updated = updater(all[idx]);
  all[idx] = updated;
  try {
    saveAll(all);
  } catch {
    // Best-effort; the in-memory mutation still happened for this session
  }
  return updated;
}

function removeOne(id: string): void {
  const all = loadAll();
  const next = all.filter((u) => u.id !== id);
  try {
    saveAll(next);
  } catch {
    // Ignore — worst case a stale entry sits in storage
  }
}

// ─────────────────────────────────────────────────────────────
// file <-> data URL helpers
// ─────────────────────────────────────────────────────────────

const MAX_PHOTO_DIMENSION = 1920;
const JPEG_QUALITY = 0.75;

/**
 * Compress an image file to max dimension and JPEG quality
 * before converting to data URL. Reduces localStorage pressure.
 */
function compressAndConvertToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(MAX_PHOTO_DIMENSION / img.width, MAX_PHOTO_DIMENSION / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fall back to raw FileReader if image can't be loaded for compression
      fileToDataUrl(file).then(resolve, reject);
    };
    img.src = objectUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read error"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a data URL back into a File without using fetch(data:…),
 * which can be blocked by strict Content Security Policies in some
 * browsers and WebViews.
 */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

// ─────────────────────────────────────────────────────────────
// public API
// ─────────────────────────────────────────────────────────────

/**
 * Enqueue a new photo for upload.
 *
 * @throws if localStorage is full or unavailable — callers should catch and
 * surface a warning to the user so they know the photo wasn't queued.
 */
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
  },
): Promise<PendingUpload> {
  const fileDataUrl = await compressAndConvertToDataUrl(file);

  // Guard: check if adding this item would exceed the localStorage budget
  const currentBytes = getStorageUsageBytes();
  const newItemBytes = new Blob([fileDataUrl]).size + 500; // ~500 bytes overhead for metadata
  if (currentBytes + newItemBytes > MAX_QUEUE_BYTES) {
    throw new Error(
      "Local storage limit reached. Please retry pending uploads before adding more photos."
    );
  }

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
    fileDataUrl,
    inspectionId: args.inspectionId ?? null,
    jobNumber: args.jobNumber ?? null,
    vehicleReg: args.vehicleReg ?? null,
    damageItemId: args.damageItemId ?? null,
  };

  const all = loadAll();
  all.push(item);
  saveAll(all); // intentionally throws on quota error
  return item;
}

// 🔧 IMPORTANT: keep this async so .then(...) and await both work
export async function getAllPendingUploads(): Promise<PendingUpload[]> {
  return loadAll();
}

export function deletePendingUpload(id: string): void {
  removeOne(id);
}

/**
 * Remove all items with status "done" from the queue.
 * Call this periodically or after a sync to reclaim localStorage quota.
 */
export function pruneDone(): void {
  const all = loadAll();
  const next = all.filter((u) => u.status !== "done");
  try {
    saveAll(next);
  } catch {
    // Ignore
  }
}

/**
 * Try to upload a single pending item.
 * Returns true on success, false if the item was not found, already in flight,
 * or the upload failed.
 */
export async function retryUpload(
  id: string,
  options?: { timeoutMs?: number }, // kept for API compatibility, not used in this version
): Promise<boolean> {
  // Prevent concurrent uploads of the same item
  if (inFlight.has(id)) return false;
  inFlight.add(id);

  try {
    const existing = updateOne(id, (u) => ({
      ...u,
      status: "uploading",
      errorMessage: null,
    }));

    if (!existing) return false;

    // If there is no file data, assume it's already been uploaded and just mark as done.
    if (!existing.fileDataUrl) {
      updateOne(id, (u) => ({
        ...u,
        status: "done",
        completedAt: u.completedAt ?? new Date().toISOString(),
        errorMessage: null,
      }));
      return true;
    }

    const file = dataUrlToFile(
      existing.fileDataUrl,
      `${existing.id}.jpg`,
    );

    // Upload to configured storage (Supabase bucket or Google Drive wrapper)
    const stored = await storageService.uploadImage(
      file,
      `jobs/${existing.jobId}/${existing.inspectionType}/${existing.photoType}/${existing.id}`,
    );

    // Insert row into photos table
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

    // Write photo URL back to damage_items if this is a damage photo
    if (existing.photoType === "damage_close_up" && existing.damageItemId) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase
          .from("damage_items")
          .update({ photo_url: stored.url })
          .eq("id", existing.damageItemId);
      } catch {
        // Best-effort — the photo is already in the photos table
      }
    }

    // On success: record completion metadata and strip the raw image data
    // to reclaim localStorage quota. The DB row is now the source of truth.
    updateOne(id, (u) => ({
      ...u,
      status: "done",
      completedAt: new Date().toISOString(),
      errorMessage: null,
      fileDataUrl: null, // free the base64 blob
      backend: stored.backend,
      backendRef: stored.backendRef ?? null,
    }));

    return true;
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : "Upload failed";

    updateOne(id, (u) => ({
      ...u,
      status: "failed",
      errorMessage: msg,
    }));

    // Log failure to client_logs (orgId auto-resolved from session by logger)
    const item = loadAll().find((u) => u.id === id);
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

/**
 * Retry all items currently marked pending or failed, sequentially to avoid
 * hammering the network. Returns a summary for the UI.
 */
export async function retryAllPending(options?: {
  timeoutMs?: number;
}): Promise<{ succeeded: number; failed: number }> {
  const targets = loadAll().filter(
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

  return { succeeded, failed };
}

// ─────────────────────────────────────────────────────────────
// Job-level grouping helpers
// ─────────────────────────────────────────────────────────────

export interface JobUploadSummary {
  jobId: string;
  jobNumber: string | null;
  vehicleReg: string | null;
  pendingCount: number;
  failedCount: number;
  lastErrorAt: string | null;
}

/**
 * Group all actionable (pending/failed) uploads by job.
 * Returns one summary per job for the job-level Pending Uploads screen.
 */
export function getPendingUploadsByJob(): JobUploadSummary[] {
  const all = loadAll().filter(
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
        // Track most recent error timestamp
        const errTime = u.completedAt || u.createdAt;
        if (!entry.lastErrorAt || errTime > entry.lastErrorAt) {
          entry.lastErrorAt = errTime;
        }
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Count distinct jobs with pending/failed uploads.
 */
export function getPendingJobCount(): number {
  return getPendingUploadsByJob().length;
}

/**
 * Retry uploads for a single job. Returns success/failure counts.
 */
export async function retryJobUploads(
  jobId: string,
): Promise<{ succeeded: number; failed: number }> {
  const targets = loadAll().filter(
    (u) =>
      u.jobId === jobId &&
      (u.status === "pending" || u.status === "failed"),
  );

  let succeeded = 0;
  let failed = 0;

  for (const u of targets) {
    const ok = await retryUpload(u.id);
    if (ok) succeeded++;
    else failed++;
  }

  return { succeeded, failed };
}

  return Array.from(jobMap.entries())
    .filter(([, allDone]) => allDone)
    .map(([jobId]) => jobId);
}