/**
 * IndexedDB-backed store for in-progress inspection photos.
 *
 * Why this exists
 * ───────────────
 * The inspection form's autosave (src/lib/autosave.ts) persists scalar form
 * fields to localStorage so a driver can exit and resume an inspection. But
 * captured camera photos live as `File` blobs + `blob:` object URLs in
 * component state — neither survives a page close. If the driver capped a
 * dozen photos, then their phone backgrounded the app, they'd come back to
 * an empty photo grid and have to retake everything.
 *
 * This module persists those File blobs to IndexedDB, keyed by
 * `${inspectionType}|${jobId}`. On mount the inspection page rehydrates
 * the blobs back into Files + fresh object URLs. On submit/discard we
 * clear the entry.
 *
 * NOT used for upload retries — that's pendingUploads.ts. This is purely
 * a "draft photo" cache for the in-progress capture step.
 */

const DB_NAME = "axentra.photoDrafts.v1";
const STORE = "photos";
const DB_VERSION = 1;

// Bytes are stored as an ArrayBuffer, not a Blob: iOS WebKit can zero out a Blob
// held in IndexedDB when it reclaims the backing temp file (backgrounding /
// memory pressure). An ArrayBuffer is copied inline by structured clone and
// survives. `blob` is retained as optional for reading legacy draft records.
export interface StoredStandardPhoto {
  /** photoKey, e.g. `pickup_exterior_front` */
  key: string;
  bytes?: ArrayBuffer;
  /** @deprecated legacy records only */
  blob?: Blob;
  type: string;
  name: string;
}

export interface StoredAdditionalPhoto {
  /** Stable tempId assigned at capture time. */
  tempId: string;
  bytes?: ArrayBuffer;
  /** @deprecated legacy records only */
  blob?: Blob;
  label: string;
  type: string;
  name: string;
}

export interface PhotoDraftRecord {
  id: string; // `${inspectionType}|${jobId}`
  jobId: string;
  inspectionType: string;
  standardPhotos: StoredStandardPhoto[];
  additionalPhotos: StoredAdditionalPhoto[];
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function draftId(inspectionType: string, jobId: string): string {
  return `${inspectionType}|${jobId}`;
}

export async function loadPhotoDraft(
  inspectionType: string,
  jobId: string,
): Promise<PhotoDraftRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(draftId(inspectionType, jobId));
      req.onsuccess = () => resolve((req.result as PhotoDraftRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveStandardPhoto(
  inspectionType: string,
  jobId: string,
  photoKey: string,
  file: File,
): Promise<void> {
  try {
    const bytes = await file.arrayBuffer();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const id = draftId(inspectionType, jobId);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = (getReq.result as PhotoDraftRecord | undefined) ?? {
          id,
          jobId,
          inspectionType,
          standardPhotos: [],
          additionalPhotos: [],
          updatedAt: Date.now(),
        };
        const next: PhotoDraftRecord = {
          ...existing,
          standardPhotos: [
            ...existing.standardPhotos.filter((p) => p.key !== photoKey),
            { key: photoKey, bytes, type: file.type, name: file.name },
          ],
          updatedAt: Date.now(),
        };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    // best-effort — if persistence fails the in-memory File still works
  }
}

export async function removeStandardPhoto(
  inspectionType: string,
  jobId: string,
  photoKey: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const id = draftId(inspectionType, jobId);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as PhotoDraftRecord | undefined;
        if (!existing) return resolve();
        const next: PhotoDraftRecord = {
          ...existing,
          standardPhotos: existing.standardPhotos.filter((p) => p.key !== photoKey),
          updatedAt: Date.now(),
        };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    // ignore
  }
}

export async function saveAdditionalPhoto(
  inspectionType: string,
  jobId: string,
  tempId: string,
  file: File,
  label: string,
): Promise<void> {
  try {
    const bytes = await file.arrayBuffer();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const id = draftId(inspectionType, jobId);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = (getReq.result as PhotoDraftRecord | undefined) ?? {
          id,
          jobId,
          inspectionType,
          standardPhotos: [],
          additionalPhotos: [],
          updatedAt: Date.now(),
        };
        const next: PhotoDraftRecord = {
          ...existing,
          additionalPhotos: [
            ...existing.additionalPhotos.filter((p) => p.tempId !== tempId),
            { tempId, bytes, label, type: file.type, name: file.name },
          ],
          updatedAt: Date.now(),
        };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    // ignore
  }
}

export async function removeAdditionalPhoto(
  inspectionType: string,
  jobId: string,
  tempId: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const id = draftId(inspectionType, jobId);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as PhotoDraftRecord | undefined;
        if (!existing) return resolve();
        const next: PhotoDraftRecord = {
          ...existing,
          additionalPhotos: existing.additionalPhotos.filter((p) => p.tempId !== tempId),
          updatedAt: Date.now(),
        };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    // ignore
  }
}

export async function clearPhotoDraft(
  inspectionType: string,
  jobId: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).delete(draftId(inspectionType, jobId));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }
}

/** Helper to convert a stored photo (ArrayBuffer bytes, or legacy Blob) into a File. */
export function storedToFile(stored: {
  bytes?: ArrayBuffer;
  blob?: Blob;
  type: string;
  name: string;
}): File {
  const parts: BlobPart[] = stored.bytes
    ? [stored.bytes]
    : stored.blob
      ? [stored.blob]
      : [];
  return new File(parts, stored.name, { type: stored.type });
}
