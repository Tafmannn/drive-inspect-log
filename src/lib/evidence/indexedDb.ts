/**
 * Evidence IndexedDB layer — the durable local source of truth.
 *
 * Two object stores, versioned:
 *   • meta  (keyPath localId, index by_job on jobId) — cheap to list/scan.
 *   • blob  (keyPath localId)                        — heavy bytes, read on demand.
 *
 * Bytes are stored as ArrayBuffers (NOT Blobs): iOS WebKit stores a Blob in IDB
 * as a temp-file reference it can later reclaim, silently zeroing the bytes.
 * ArrayBuffers are copied inline by structured clone and survive.
 *
 * This module is deliberately dumb: it does raw persistence and nothing else.
 * No compression, no upload, no domain rules. That keeps it easy to reason about
 * and hard to break.
 */

import { EVIDENCE_DB, type EvidenceItem, type EvidenceBytes } from "./types";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(EVIDENCE_DB.NAME, EVIDENCE_DB.VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EVIDENCE_DB.META_STORE)) {
        const meta = db.createObjectStore(EVIDENCE_DB.META_STORE, { keyPath: "localId" });
        meta.createIndex(EVIDENCE_DB.JOB_INDEX, "jobId", { unique: false });
      }
      if (!db.objectStoreNames.contains(EVIDENCE_DB.BLOB_STORE)) {
        db.createObjectStore(EVIDENCE_DB.BLOB_STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Writes ─────────────────────────────────────────────────────────────

/** Upsert metadata + bytes atomically (single transaction across both stores). */
export async function putEvidence(item: EvidenceItem, bytes: EvidenceBytes): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([EVIDENCE_DB.META_STORE, EVIDENCE_DB.BLOB_STORE], "readwrite");
  tx.objectStore(EVIDENCE_DB.META_STORE).put(item);
  tx.objectStore(EVIDENCE_DB.BLOB_STORE).put(bytes);
  await txDone(tx);
}

/** Upsert metadata only (status changes, retry bookkeeping) — never touches bytes. */
export async function putMeta(item: EvidenceItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(EVIDENCE_DB.META_STORE, "readwrite");
  tx.objectStore(EVIDENCE_DB.META_STORE).put(item);
  await txDone(tx);
}

/** Delete an item and its bytes. */
export async function deleteEvidence(localId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([EVIDENCE_DB.META_STORE, EVIDENCE_DB.BLOB_STORE], "readwrite");
  tx.objectStore(EVIDENCE_DB.META_STORE).delete(localId);
  tx.objectStore(EVIDENCE_DB.BLOB_STORE).delete(localId);
  await txDone(tx);
}

/** Drop just the bytes once uploaded, to reclaim quota; metadata is retained. */
export async function deleteBytes(localId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(EVIDENCE_DB.BLOB_STORE, "readwrite");
  tx.objectStore(EVIDENCE_DB.BLOB_STORE).delete(localId);
  await txDone(tx);
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getMeta(localId: string): Promise<EvidenceItem | null> {
  const db = await openDb();
  const tx = db.transaction(EVIDENCE_DB.META_STORE, "readonly");
  const row = await reqResult(tx.objectStore(EVIDENCE_DB.META_STORE).get(localId));
  return (row as EvidenceItem | undefined) ?? null;
}

export async function getBytes(localId: string): Promise<EvidenceBytes | null> {
  const db = await openDb();
  const tx = db.transaction(EVIDENCE_DB.BLOB_STORE, "readonly");
  const row = await reqResult(tx.objectStore(EVIDENCE_DB.BLOB_STORE).get(localId));
  return (row as EvidenceBytes | undefined) ?? null;
}

/** All metadata for a job, via the by_job index. Bytes are NOT loaded. */
export async function listMetaByJob(jobId: string): Promise<EvidenceItem[]> {
  const db = await openDb();
  const tx = db.transaction(EVIDENCE_DB.META_STORE, "readonly");
  const index = tx.objectStore(EVIDENCE_DB.META_STORE).index(EVIDENCE_DB.JOB_INDEX);
  const rows = await reqResult(index.getAll(jobId));
  return (rows as EvidenceItem[] | undefined) ?? [];
}

/** All metadata across all jobs (queue boot scan). Bytes are NOT loaded. */
export async function listAllMeta(): Promise<EvidenceItem[]> {
  const db = await openDb();
  const tx = db.transaction(EVIDENCE_DB.META_STORE, "readonly");
  const rows = await reqResult(tx.objectStore(EVIDENCE_DB.META_STORE).getAll());
  return (rows as EvidenceItem[] | undefined) ?? [];
}

/** Test-only: clear both object stores (fast; no connection teardown needed). */
export async function __clearForTests(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([EVIDENCE_DB.META_STORE, EVIDENCE_DB.BLOB_STORE], "readwrite");
  tx.objectStore(EVIDENCE_DB.META_STORE).clear();
  tx.objectStore(EVIDENCE_DB.BLOB_STORE).clear();
  await txDone(tx);
}
