/**
 * Evidence upload queue — the background worker.
 *
 * Boring, deterministic, single-flight. It does not know HOW to upload; the
 * transport is injected (EvidenceTransport). That keeps this logic testable
 * without a backend and lets Phase 3 supply the real Supabase storage + DB
 * insert without changing a line here.
 *
 * Guarantees:
 *   • Single-flight: concurrent drains collapse to one.
 *   • Offline-aware: does nothing when navigator.onLine === false.
 *   • Respects per-item backoff (nextRetryAt) and the max-attempt ceiling.
 *   • Idempotent: transport.upload is keyed on item.localId, so a replay after a
 *     lost response never double-writes.
 *   • Never throws to the caller — every failure is recorded on the item.
 */

import {
  getItemBytes,
  listPendingWork,
  markFailed,
  markUploaded,
  markUploading,
} from "./evidenceStore";
import {
  EVIDENCE_BUDGETS,
  type EvidenceItem,
  type EvidenceLogger,
  type EvidenceTransport,
} from "./types";

const noopLogger: EvidenceLogger = { event: () => {} };

export interface DrainResult {
  attempted: number;
  uploaded: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

function isEligible(item: EvidenceItem, now: number): boolean {
  if (item.uploadStatus === "queued") return true;
  if (item.uploadStatus === "failed") {
    if (item.retryCount >= EVIDENCE_BUDGETS.MAX_UPLOAD_ATTEMPTS) return false;
    if (item.nextRetryAt && Date.parse(item.nextRetryAt) > now) return false;
    return true;
  }
  return false;
}

export class EvidenceUploadQueue {
  private draining = false;

  constructor(
    private readonly transport: EvidenceTransport,
    private readonly logger: EvidenceLogger = noopLogger,
  ) {}

  /**
   * Process every eligible item once. Safe to call repeatedly (on online/focus/
   * boot). Returns counts for the caller to surface in UI.
   */
  async drain(): Promise<DrainResult> {
    if (this.draining) {
      return { attempted: 0, uploaded: 0, failed: 0, skipped: true, reason: "in_flight" };
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { attempted: 0, uploaded: 0, failed: 0, skipped: true, reason: "offline" };
    }

    this.draining = true;
    let attempted = 0;
    let uploaded = 0;
    let failed = 0;
    try {
      const now = Date.now();
      const work = (await listPendingWork()).filter((i) => isEligible(i, now));
      for (const item of work) {
        attempted++;
        try {
          await this.uploadOne(item);
          uploaded++;
        } catch (e) {
          failed++;
          const message = e instanceof Error ? e.message : String(e);
          await markFailed(item.localId, message);
          this.logger.event("evidence_upload_failed", "error", {
            localId: item.localId,
            jobId: item.jobId,
            attempts: item.retryCount + 1,
            message,
          });
        }
      }
    } finally {
      this.draining = false;
    }
    return { attempted, uploaded, failed, skipped: false };
  }

  private async uploadOne(item: EvidenceItem): Promise<void> {
    const bytes = await getItemBytes(item.localId);
    if (!bytes || bytes.bytes.byteLength === 0) {
      // Bytes gone or empty — nothing recoverable to upload. Mark failed so it
      // surfaces to the driver rather than silently retrying forever.
      throw new Error("EMPTY_OR_MISSING_BYTES");
    }

    await markUploading(item.localId);
    const result = await this.transport.upload(item, bytes);

    await markUploaded(item.localId, {
      serverId: result.serverId,
      storageBucket: result.storageBucket,
      storagePath: result.storagePath,
      thumbnailPath: result.thumbnailPath,
    });
    this.logger.event("evidence_uploaded", "info", {
      localId: item.localId,
      jobId: item.jobId,
      serverId: result.serverId,
    });
  }
}
