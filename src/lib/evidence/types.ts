/**
 * Evidence subsystem — domain types and contracts.
 *
 * Evidence is a CORE BUSINESS DOMAIN: photos (today) are legal/commercial proof
 * of vehicle condition, collection and delivery. Design rules for this module:
 *
 *   • Deterministic, boring behaviour over cleverness.
 *   • Every item is content-addressable (sha-256 `hash`) for dedupe + integrity.
 *   • `capturedAt` is the TRUE capture time, immutable, distinct from upload time.
 *   • The local record is the source of truth until the server confirms receipt.
 *   • Extension points (`evidenceType`, `metadata`) store data only — they add
 *     NO behaviour today. Signatures/documents/videos/OCR/AI slot in as data.
 *
 * This file is pure types + constants. It imports nothing and changes no
 * existing behaviour.
 */

// ─── Enumerations (string unions — stable wire values) ──────────────────

/** Which leg of the job the evidence belongs to. */
export type EvidenceStage = "pickup" | "delivery";

/**
 * Kind of evidence. TODAY only "photo" is produced. The field exists so a
 * signature/document/video is a new VALUE, never a new table. Do not add
 * behaviour keyed on non-photo values in this phase.
 */
export type EvidenceType = "photo";

/**
 * Business category of the shot. Stable vocabulary shared with the legacy
 * adapter. `additional` = driver's extra photos; `damage` = a close-up linked
 * to a damage item.
 */
export type EvidenceCategory =
  | "front"
  | "rear"
  | "nearside"
  | "offside"
  | "interior"
  | "dashboard"
  | "mileage"
  | "fuel"
  | "vin"
  | "keys"
  | "document"
  | "damage"
  | "customer_requested"
  | "additional";

/**
 * Upload lifecycle. Deterministic state machine:
 *   queued → uploading → uploaded            (terminal success today)
 *   uploading → failed → queued              (retry with backoff)
 * `verified` is a RESERVED value for a future server-confirmation step. It is
 * intentionally unused in this phase (no probe code) but declared so adding it
 * later needs no type change.
 */
export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed" | "verified";

/** Admin moderation state. Only "pending" is written today. */
export type ReviewStatus = "pending" | "approved" | "rejected";

// ─── The local evidence record (IndexedDB source of truth) ──────────────

/**
 * A single piece of captured evidence, held locally until the server confirms.
 * `localId` is a client-generated UUID and is reused verbatim as the server
 * `id`, so upload is idempotent (a replay never creates a second row/object).
 */
export interface EvidenceItem {
  /** Client UUID; becomes the server row id. Stable for the item's whole life. */
  localId: string;
  /** Server row id once confirmed. Equal to localId by construction; null until insert succeeds. */
  serverId: string | null;

  jobId: string;
  externalJobNumber: string | null;
  /** Server-authoritative; only set locally when safely known, else null. */
  orgId: string | null;
  inspectionId: string | null;
  /** Per-run isolation tag (reopen semantics). Null on items captured before a run exists. */
  runId: string | null;

  stage: EvidenceStage;
  evidenceType: EvidenceType;
  category: EvidenceCategory;
  /** Links a damage close-up to its damage item, when the flow supplies one. */
  damageItemId: string | null;

  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  /** sha-256 hex of the processed bytes. Integrity + duplicate suppression key. */
  hash: string;

  capturedAt: string; // ISO, immutable — TRUE capture time
  capturedBy: string | null;

  uploadStatus: UploadStatus;
  retryCount: number;
  /** ISO time before which the queue must not re-attempt (backoff). Null = eligible now. */
  nextRetryAt: string | null;
  lastError: string | null;

  /** Storage location, filled once the object is written. */
  storageBucket: string | null;
  storagePath: string | null;
  thumbnailPath: string | null;

  reviewStatus: ReviewStatus;

  /** Extension point. Empty today. Never branch behaviour on it in this phase. */
  metadata: Record<string, unknown>;

  createdAt: string; // ISO, immutable
  updatedAt: string; // ISO
}

/**
 * Unified, read-only projection used by display / POD / Admin so consumers never
 * branch on "new vs legacy". Produced from an EvidenceItem OR a legacy photo row
 * (via legacyAdapter). URLs are resolved lazily by signedUrls.
 */
export interface EvidenceView {
  id: string;
  source: "evidence" | "legacy";
  jobId: string;
  stage: EvidenceStage | null;
  category: EvidenceCategory | null;
  evidenceType: EvidenceType;
  damageItemId: string | null;
  capturedAt: string | null;
  /** Original legacy `photos.type` (e.g. "pickup_exterior_front"); null for new evidence. */
  legacyType: string | null;
  /** For new evidence: where to sign from. For legacy: null (use `legacyUrl`). */
  storageBucket: string | null;
  storagePath: string | null;
  thumbnailPath: string | null;
  /** For legacy rows: the stored URL/ref to resolve through existing resolvers. */
  legacyUrl: string | null;
  hash: string | null;
}

/** Binary payload, stored separately from metadata so list reads stay cheap. */
export interface EvidenceBytes {
  localId: string;
  /** Full-resolution (compressed) image bytes. ArrayBuffer, NOT Blob — survives iOS WebKit IDB reclaim. */
  bytes: ArrayBuffer;
  /** Thumbnail bytes, or null if generation failed (full image still uploads). */
  thumbBytes: ArrayBuffer | null;
  mimeType: string;
}

// ─── Contracts (dependency-injected so this layer stays testable + isolated) ─

/** Result of processing a raw camera File into upload-ready evidence bytes. */
export interface ProcessedImage {
  bytes: ArrayBuffer;
  thumbBytes: ArrayBuffer | null;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  hash: string;
}

/** What the caller supplies to record a capture. */
export interface CaptureInput {
  file: File;
  jobId: string;
  stage: EvidenceStage;
  category: EvidenceCategory;
  externalJobNumber?: string | null;
  orgId?: string | null;
  inspectionId?: string | null;
  runId?: string | null;
  damageItemId?: string | null;
  capturedBy?: string | null;
  /** Optional: caller-fixed localId (e.g. to correlate with existing flow). */
  localId?: string;
  /** Optional extension-point data (e.g. { label } for additional photos). */
  metadata?: Record<string, unknown>;
}

/**
 * Transport contract for the upload worker. Injected so uploadQueue can be
 * unit-tested without a live backend and so Phase 3 (real Supabase storage +
 * evidence_items insert) plugs in without touching queue logic.
 */
export interface EvidenceTransport {
  /** Upload the object + thumbnail and insert the DB row. Idempotent on item.localId. */
  upload(item: EvidenceItem, bytes: EvidenceBytes): Promise<UploadResult>;
}

export interface UploadResult {
  serverId: string;
  storageBucket: string;
  storagePath: string;
  thumbnailPath: string | null;
}

/** Minimal observability sink. Injected; defaults to the app logger when wired. */
export interface EvidenceLogger {
  event(name: string, level: "info" | "warn" | "error", data?: Record<string, unknown>): void;
}

// ─── Performance & lifecycle budgets (measurable, enforced by constants) ────

export const EVIDENCE_BUDGETS = {
  /** Longest edge of the stored image. Balances legibility vs mobile memory. */
  MAX_IMAGE_DIMENSION: 1920,
  JPEG_QUALITY: 0.75,
  /** Thumbnail longest edge — must render a full job grid without full images. */
  THUMBNAIL_DIMENSION: 320,
  THUMBNAIL_QUALITY: 0.6,
  /** Soft cap: processing one photo should stay under this on a mid-range phone. */
  PROCESS_TARGET_MS: 1500,
  /** Retry policy: capped exponential backoff. */
  MAX_UPLOAD_ATTEMPTS: 8,
  BACKOFF_BASE_MS: 2000,
  BACKOFF_FACTOR: 2,
  BACKOFF_CAP_MS: 5 * 60 * 1000,
} as const;

/** IndexedDB database + store names (versioned; never rename in place). */
export const EVIDENCE_DB = {
  NAME: "axentra-evidence",
  VERSION: 1,
  META_STORE: "meta",
  BLOB_STORE: "blob",
  JOB_INDEX: "by_job",
} as const;
