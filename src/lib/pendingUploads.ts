// src/lib/pendingUploads.ts
// Local-first photo upload queue for Axentra inspections.
// Stores images in localStorage while offline / low signal, then
// replays them to Supabase (and Google Drive if configured).

import { storageService } from "./storage";
import { insertPhoto } from "./api";
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
  status: PendingUploadStatus;
  errorMessage?: string | null;

  // Local-only data for reconstructing the file
  fileDataUrl: string;

  // Optional metadata that can be attached later
  backend?: StorageBackend;
  backendRef?: string | null;
  jobNumber?: string | null;
  vehicleReg?: string | null;
}

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
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingUpload[];
  } catch {
    return [];
  }
}

function saveAll(items: PendingUpload[]): void {
  const storage = safeGetStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // If we run out of quota, we silently ignore – app should still work
  }
}

function updateOne(
  id: string,
  updater: (item: PendingUpload) => PendingUpload
): PendingUpload | null {
  const all = loadAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const updated = updater(all[idx]);
  all[idx] = updated;
  saveAll(all);
  return updated;
}

function removeOne(id: string): void {
  const all = loadAll();
  const next = all.filter((u) => u.id !== id);
  saveAll(next);
}

// ─────────────────────────────────────────────────────────────
// file <-> data URL helpers
// ─────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("File read error"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  // Using fetch on data: URLs is widely supported and keeps code simple
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
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
    jobNumber?: string | null;
    vehicleReg?: string | null;
  }
): Promise<PendingUpload> {
  const fileDataUrl = await fileToDataUrl(file);
  const id =
    "pu_" + Date.now().toString() + "_" + Math.random().toString(36).slice(2);

  const item: PendingUpload = {
    id,
    jobId: args.jobId,
    inspectionType: args.inspectionType,
    photoType: args.photoType,
    label: args.label ?? null,
    createdAt: new Date().toISOString(),
    status: "pending",
    errorMessage: null,
    fileDataUrl,
    jobNumber: args.jobNumber,
    vehicleReg: args.vehicleReg,
  };

  const all = loadAll();
  all.push(item);
  saveAll(all);

  return item;
}

export async function getAllPendingUploads(): Promise<PendingUpload[]> {
  return loadAll();
}

export async function deletePendingUpload(id: string): Promise<void> {
  removeOne(id);
}

/**
 * Try to upload a single pending item.
 * Returns true on success, false on failure.
 */
export async function retryUpload(id: string): Promise<boolean> {
  const existing = updateOne(id, (u) => ({
    ...u,
    status: "uploading",
    errorMessage: null,
  }));

  if (!existing) return false;

  try {
    const file = await dataUrlToFile(existing.fileDataUrl, `${existing.id}.jpg`);

    // Upload to configured storage (Supabase bucket or Google Drive wrapper)
    const stored = await storageService.uploadImage(
      file,
      `jobs/${existing.jobId}/${existing.inspectionType}/${existing.photoType}/${existing.id}`
    );

    // Insert row into photos table – inspections link via job_id + type
    await insertPhoto({
      job_id: existing.jobId,
      inspection_id: null, // can be associated later server-side if needed
      type: existing.photoType,
      url: stored.url,
      thumbnail_url: stored.thumbnailUrl ?? null,
      backend: stored.backend,
      backend_ref: stored.backendRef ?? null,
      label: existing.label,
    });

    updateOne(id, (u) => ({
      ...u,
      status: "done",
      errorMessage: null,
      backend: stored.backend,
      backendRef: stored.backendRef ?? null,
    }));

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    updateOne(id, (u) => ({
      ...u,
      status: "failed",
      errorMessage: msg,
    }));
    return false;
  }
}

/**
 * Retry all items currently marked pending or failed.
 * Returns a small summary for the UI.
 */
export async function retryAllPending(): Promise<{
  succeeded: number;
  failed: number;
}> {
  const all = loadAll();
  const targets = all.filter(
    (u) => u.status === "pending" || u.status === "failed"
  );

  let succeeded = 0;
  let failed = 0;

  // Do them sequentially to avoid hammering the network
  for (const u of targets) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await retryUpload(u.id);
    if (ok) succeeded++;
    else failed++;
  }

  return { succeeded, failed };
}