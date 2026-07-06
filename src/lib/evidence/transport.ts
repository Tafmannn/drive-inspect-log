/**
 * SupabaseEvidenceTransport — the real upload path for evidence items.
 *
 * Steps (each independently idempotent, so a retry after ANY partial failure
 * never duplicates objects or rows):
 *   1) PUT full image to the private `vehicle-photos` bucket at a
 *      deterministic path (upsert: replay overwrites the same object).
 *   2) PUT thumbnail (best-effort; failure never blocks the full image).
 *   3) INSERT public.evidence_items with id = localId (23505 duplicate-key on
 *      replay is treated as success).
 *   4) BRIDGE: insert a legacy public.photos row (via api.insertPhoto — keeps
 *      the RUN_UNVERIFIED guard + server org trigger + damage sync) so every
 *      existing reader (POD, JobDetail, Admin gates, exports) sees v2 photos
 *      TODAY, before the Phase 6/7 merged-read migration. Idempotent by
 *      backend_ref. The bridge is temporary and documented for removal once
 *      reads prefer evidence_items.
 *
 * Storage security: bucket RLS (org/job-scoped, jobs/<jobId>/… paths) already
 * covers these writes; nothing here adds privilege.
 */

import { supabase } from "@/integrations/supabase/client";
import { insertPhoto } from "@/lib/api";
import { toLegacyType } from "./legacyAdapter";
import type {
  EvidenceBytes,
  EvidenceItem,
  EvidenceTransport,
  UploadResult,
} from "./types";

const BUCKET = "vehicle-photos";

function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function isUuid(v: string | null | undefined): boolean {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export class SupabaseEvidenceTransport implements EvidenceTransport {
  async upload(item: EvidenceItem, bytes: EvidenceBytes): Promise<UploadResult> {
    const ext = extFor(bytes.mimeType);
    const base = `jobs/${item.jobId}/${item.stage}/${item.category}/${item.localId}`;
    const storagePath = `${base}.${ext}`;

    // ── 1) Full image ──
    const blob = new Blob([bytes.bytes], { type: bytes.mimeType });
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { upsert: true, contentType: bytes.mimeType });
    if (upErr) throw new Error(`STORAGE_UPLOAD_FAILED: ${upErr.message}`);

    // ── 2) Thumbnail (best-effort) ──
    let thumbnailPath: string | null = null;
    if (bytes.thumbBytes && bytes.thumbBytes.byteLength > 0) {
      const tPath = `${base}_thumb.jpg`;
      const tBlob = new Blob([bytes.thumbBytes], { type: "image/jpeg" });
      const { error: tErr } = await supabase.storage
        .from(BUCKET)
        .upload(tPath, tBlob, { upsert: true, contentType: "image/jpeg" });
      if (!tErr) thumbnailPath = tPath;
    }

    // ── 3) evidence_items row (idempotent on id = localId) ──
    // org_id is intentionally omitted — the BEFORE INSERT trigger derives it
    // from the job (server-authoritative). Table is newer than the generated
    // client types, hence the untyped access.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: evErr } = await (supabase as any).from("evidence_items").insert({
      id: item.localId,
      job_id: item.jobId,
      inspection_id: item.inspectionId,
      run_id: item.runId,
      stage: item.stage,
      evidence_type: item.evidenceType,
      category: item.category,
      damage_item_id: item.damageItemId,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      mime_type: bytes.mimeType,
      file_size: item.fileSize,
      width: item.width,
      height: item.height,
      hash: item.hash,
      metadata: item.metadata ?? {},
      captured_by: isUuid(item.capturedBy) ? item.capturedBy : null,
      captured_at: item.capturedAt,
    });
    if (evErr && evErr.code !== "23505") {
      throw new Error(`EVIDENCE_INSERT_FAILED: ${evErr.message}`);
    }

    // ── 4) Legacy bridge photos row (idempotent by backend_ref) ──
    const { data: existingBridge } = await supabase
      .from("photos")
      .select("id")
      .eq("backend_ref", storagePath)
      .limit(1);

    if (!existingBridge || existingBridge.length === 0) {
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
        .data.publicUrl;
      const thumbUrl = thumbnailPath
        ? supabase.storage.from(BUCKET).getPublicUrl(thumbnailPath).data.publicUrl
        : null;

      const payload: Parameters<typeof insertPhoto>[0] = {
        job_id: item.jobId,
        inspection_id: item.inspectionId,
        type: toLegacyType(item.stage, item.category),
        url: publicUrl,
        thumbnail_url: thumbUrl,
        backend: "internal",
        backend_ref: storagePath,
        label:
          typeof item.metadata?.label === "string" && item.metadata.label
            ? (item.metadata.label as string)
            : null,
      };
      // Pass run_id only when the capture recorded one; otherwise let
      // insertPhoto resolve the job's current run (its RUN_UNVERIFIED guard
      // applies exactly as it does for the legacy pipeline).
      if (item.runId != null) {
        (payload as { run_id?: string | null }).run_id = item.runId;
      }
      await insertPhoto(payload);
    }

    return {
      serverId: item.localId,
      storageBucket: BUCKET,
      storagePath,
      thumbnailPath,
    };
  }
}
