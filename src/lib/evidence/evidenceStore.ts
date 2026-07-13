/**
 * Evidence store — the domain API.
 *
 * Turns a raw capture into a durable, queued evidence item and exposes the
 * boring, deterministic operations the rest of the app needs: save, list by
 * job/stage/category, read bytes, transition upload status, retry, remove.
 *
 * Idempotency & integrity rules live here:
 *   • localId is the stable identity (and becomes the server id).
 *   • A re-capture of identical bytes for the same (job, stage, category) is
 *     suppressed by content hash, so a double-tap never creates two rows.
 *   • Status transitions always stamp updatedAt; capturedAt/createdAt are never
 *     rewritten.
 *
 * No UI, no network. Persistence via indexedDb, processing via imageProcessing.
 */

import { processImage } from "./imageProcessing";
import {
  deleteBytes,
  deleteEvidence,
  getBytes,
  getMeta,
  listAllMeta,
  listMetaByJob,
  putEvidence,
  putMeta,
} from "./indexedDb";
import {
  EVIDENCE_BUDGETS,
  type CaptureInput,
  type EvidenceBytes,
  type EvidenceCategory,
  type EvidenceItem,
  type EvidenceStage,
  type EvidenceView,
  type UploadStatus,
} from "./types";

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Record a capture: process the file, then persist metadata + bytes as `queued`.
 * If an identical (same job/stage/category/hash) non-failed item already exists,
 * returns it unchanged instead of duplicating. Throws only if the file is empty
 * or processing yields no bytes (nothing worth persisting).
 */
export async function saveCapture(input: CaptureInput): Promise<EvidenceItem> {
  const processed = await processImage(input.file);

  // Content-hash dedupe within the same job/stage/category.
  const existingForJob = await listMetaByJob(input.jobId);
  const dupe = existingForJob.find(
    (e) =>
      e.hash === processed.hash &&
      e.stage === input.stage &&
      e.category === input.category &&
      e.uploadStatus !== "failed",
  );
  if (dupe) return dupe;

  const localId = input.localId ?? uuid();
  const ts = nowIso();
  const item: EvidenceItem = {
    localId,
    serverId: null,
    jobId: input.jobId,
    externalJobNumber: input.externalJobNumber ?? null,
    orgId: input.orgId ?? null,
    inspectionId: input.inspectionId ?? null,
    runId: input.runId ?? null,
    stage: input.stage,
    evidenceType: "photo",
    category: input.category,
    damageItemId: input.damageItemId ?? null,
    mimeType: processed.mimeType,
    fileSize: processed.fileSize,
    width: processed.width,
    height: processed.height,
    hash: processed.hash,
    capturedAt: ts,
    capturedBy: input.capturedBy ?? null,
    uploadStatus: "queued",
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    storageBucket: null,
    storagePath: null,
    thumbnailPath: null,
    reviewStatus: "pending",
    metadata: input.metadata ?? {},
    createdAt: ts,
    updatedAt: ts,
  };

  const bytes: EvidenceBytes = {
    localId,
    bytes: processed.bytes,
    thumbBytes: processed.thumbBytes,
    mimeType: processed.mimeType,
  };

  await putEvidence(item, bytes);
  return item;
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getItem(localId: string): Promise<EvidenceItem | null> {
  return getMeta(localId);
}

export async function getItemBytes(localId: string): Promise<EvidenceBytes | null> {
  return getBytes(localId);
}

export async function listByJob(jobId: string): Promise<EvidenceItem[]> {
  const items = await listMetaByJob(jobId);
  return items.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function listByJobStage(
  jobId: string,
  stage: EvidenceStage,
): Promise<EvidenceItem[]> {
  return (await listByJob(jobId)).filter((e) => e.stage === stage);
}

export async function listByJobStageCategory(
  jobId: string,
  stage: EvidenceStage,
  category: EvidenceCategory,
): Promise<EvidenceItem[]> {
  return (await listByJobStage(jobId, stage)).filter((e) => e.category === category);
}

/**
 * Every item still needing work (queued or failed) across all jobs — queue
 * boot. Also re-arms any item stranded in "uploading" past
 * UPLOAD_STUCK_TIMEOUT_MS (app crash/reload/force-quit mid-upload) back to
 * "failed" first — otherwise nothing (this function, the upload queue's
 * isEligible() guard, and every retry trigger) would ever pick it up again,
 * and the only way out would be deleting it and permanently losing that
 * evidence. Mirrors the same fix in the legacy pendingUploads pipeline.
 */
export async function listPendingWork(): Promise<EvidenceItem[]> {
  const all = await listAllMeta();
  const now = Date.now();

  const stranded = all.filter(
    (e) =>
      e.uploadStatus === "uploading" &&
      now - Date.parse(e.updatedAt) > EVIDENCE_BUDGETS.UPLOAD_STUCK_TIMEOUT_MS,
  );
  if (stranded.length > 0) {
    const strandedMessage = "Upload was interrupted (app closed or crashed mid-upload). Retry to resume.";
    await Promise.all(
      stranded.map((e) =>
        patch(e.localId, (item) => ({
          ...item,
          uploadStatus: "failed",
          lastError: strandedMessage,
        })),
      ),
    );
    // Keep `all` (and therefore this function's return value) consistent
    // with what was just persisted, instead of returning stale in-memory
    // copies for the very items we just re-armed.
    for (const e of stranded) {
      e.uploadStatus = "failed";
      e.lastError = strandedMessage;
    }
  }

  return all.filter((e) => e.uploadStatus === "queued" || e.uploadStatus === "failed");
}

/** Project an evidence item into the unified read view (source = "evidence"). */
export function itemToView(item: EvidenceItem): EvidenceView {
  return {
    id: item.serverId ?? item.localId,
    source: "evidence",
    jobId: item.jobId,
    stage: item.stage,
    category: item.category,
    evidenceType: item.evidenceType,
    damageItemId: item.damageItemId,
    capturedAt: item.capturedAt,
    legacyType: null,
    storageBucket: item.storageBucket,
    storagePath: item.storagePath,
    thumbnailPath: item.thumbnailPath,
    legacyUrl: null,
    hash: item.hash,
  };
}

// ─── Status transitions (always stamp updatedAt; never rewrite capture/create) ──

async function patch(
  localId: string,
  mutate: (e: EvidenceItem) => EvidenceItem,
): Promise<EvidenceItem | null> {
  const current = await getMeta(localId);
  if (!current) return null;
  const next = { ...mutate(current), updatedAt: nowIso() };
  await putMeta(next);
  return next;
}

export function setStatus(localId: string, status: UploadStatus): Promise<EvidenceItem | null> {
  return patch(localId, (e) => ({ ...e, uploadStatus: status }));
}

export function markUploading(localId: string): Promise<EvidenceItem | null> {
  return patch(localId, (e) => ({ ...e, uploadStatus: "uploading", lastError: null }));
}

export async function markUploaded(
  localId: string,
  result: { serverId: string; storageBucket: string; storagePath: string; thumbnailPath: string | null },
): Promise<EvidenceItem | null> {
  const next = await patch(localId, (e) => ({
    ...e,
    uploadStatus: "uploaded",
    serverId: result.serverId,
    storageBucket: result.storageBucket,
    storagePath: result.storagePath,
    thumbnailPath: result.thumbnailPath,
    nextRetryAt: null,
    lastError: null,
  }));
  // Reclaim quota: the bytes are safely on the server now.
  if (next) await deleteBytes(localId).catch(() => {});
  return next;
}

/** Record a failed attempt and schedule the next retry with capped backoff. */
export function markFailed(localId: string, error: string): Promise<EvidenceItem | null> {
  return patch(localId, (e) => {
    const retryCount = e.retryCount + 1;
    const delay = Math.min(
      EVIDENCE_BUDGETS.BACKOFF_BASE_MS *
        Math.pow(EVIDENCE_BUDGETS.BACKOFF_FACTOR, retryCount - 1),
      EVIDENCE_BUDGETS.BACKOFF_CAP_MS,
    );
    return {
      ...e,
      uploadStatus: "failed",
      retryCount,
      lastError: error,
      nextRetryAt: new Date(Date.now() + delay).toISOString(),
    };
  });
}

/** Manual retry: clear backoff and re-queue regardless of attempt count. */
export function retry(localId: string): Promise<EvidenceItem | null> {
  return patch(localId, (e) => ({
    ...e,
    uploadStatus: "queued",
    nextRetryAt: null,
    lastError: null,
  }));
}

export async function remove(localId: string): Promise<void> {
  await deleteEvidence(localId);
}
