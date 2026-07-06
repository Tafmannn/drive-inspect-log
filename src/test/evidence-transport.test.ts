import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock supabase storage + table access, and the legacy insertPhoto bridge ──
const storageUpload = vi.fn();
const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/vehicle-photos/${path}` },
}));
const evidenceInsert = vi.fn();
const photosSelectResult = vi.fn();
const insertPhoto = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => storageUpload(...a),
        getPublicUrl: (p: string) => getPublicUrl(p),
      }),
    },
    from: (table: string) => {
      if (table === "evidence_items") {
        return { insert: (...a: unknown[]) => evidenceInsert(...a) };
      }
      if (table === "photos") {
        return {
          select: () => ({ eq: () => ({ limit: async () => photosSelectResult() }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));
vi.mock("@/lib/api", () => ({ insertPhoto: (...a: unknown[]) => insertPhoto(...a) }));

import { SupabaseEvidenceTransport } from "@/lib/evidence/transport";
import type { EvidenceBytes, EvidenceItem } from "@/lib/evidence/types";

const ITEM: EvidenceItem = {
  localId: "11111111-1111-4111-8111-111111111111",
  serverId: null,
  jobId: "job-1",
  externalJobNumber: "AX0001",
  orgId: null,
  inspectionId: null,
  runId: "22222222-2222-4222-8222-222222222222",
  stage: "pickup",
  evidenceType: "photo",
  category: "front",
  damageItemId: null,
  mimeType: "image/jpeg",
  fileSize: 6,
  width: 100,
  height: 50,
  hash: "a".repeat(64),
  capturedAt: "2026-07-06T10:00:00.000Z",
  capturedBy: "33333333-3333-4333-8333-333333333333",
  uploadStatus: "uploading",
  retryCount: 0,
  nextRetryAt: null,
  lastError: null,
  storageBucket: null,
  storagePath: null,
  thumbnailPath: null,
  reviewStatus: "pending",
  metadata: { label: "Front" },
  createdAt: "2026-07-06T10:00:00.000Z",
  updatedAt: "2026-07-06T10:00:00.000Z",
};

const BYTES: EvidenceBytes = {
  localId: ITEM.localId,
  bytes: new Uint8Array([1, 2, 3, 4, 5, 6]).buffer,
  thumbBytes: new Uint8Array([9, 9]).buffer,
  mimeType: "image/jpeg",
};

beforeEach(() => {
  storageUpload.mockReset().mockResolvedValue({ error: null });
  evidenceInsert.mockReset().mockResolvedValue({ error: null });
  photosSelectResult.mockReset().mockResolvedValue({ data: [] });
  insertPhoto.mockReset().mockResolvedValue({ id: "p1" });
});

describe("SupabaseEvidenceTransport", () => {
  it("uploads full+thumb, inserts evidence row and bridge photos row", async () => {
    const t = new SupabaseEvidenceTransport();
    const res = await t.upload(ITEM, BYTES);

    expect(res.storagePath).toBe(
      `jobs/job-1/pickup/front/${ITEM.localId}.jpg`,
    );
    expect(res.thumbnailPath).toBe(
      `jobs/job-1/pickup/front/${ITEM.localId}_thumb.jpg`,
    );
    expect(res.serverId).toBe(ITEM.localId);
    expect(storageUpload).toHaveBeenCalledTimes(2);

    // evidence row: id = localId, org omitted (server trigger), metadata carried
    const evRow = evidenceInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(evRow.id).toBe(ITEM.localId);
    expect(evRow).not.toHaveProperty("org_id");
    expect(evRow.metadata).toEqual({ label: "Front" });

    // bridge row: legacy type mapping + run passed through + label from metadata
    const bridge = insertPhoto.mock.calls[0][0] as Record<string, unknown>;
    expect(bridge.type).toBe("pickup_exterior_front");
    expect(bridge.backend_ref).toBe(res.storagePath);
    expect(bridge.run_id).toBe(ITEM.runId);
    expect(bridge.label).toBe("Front");
  });

  it("is idempotent: duplicate evidence row (23505) and existing bridge are tolerated", async () => {
    evidenceInsert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    photosSelectResult.mockResolvedValue({ data: [{ id: "already" }] });

    const t = new SupabaseEvidenceTransport();
    const res = await t.upload(ITEM, BYTES);
    expect(res.serverId).toBe(ITEM.localId);
    expect(insertPhoto).not.toHaveBeenCalled(); // bridge already exists → no dup row
  });

  it("throws on storage failure (queue will retry) without touching the DB", async () => {
    storageUpload.mockResolvedValueOnce({ error: { message: "503" } });
    const t = new SupabaseEvidenceTransport();
    await expect(t.upload(ITEM, BYTES)).rejects.toThrow(/STORAGE_UPLOAD_FAILED/);
    expect(evidenceInsert).not.toHaveBeenCalled();
    expect(insertPhoto).not.toHaveBeenCalled();
  });

  it("throws on non-duplicate evidence insert error", async () => {
    evidenceInsert.mockResolvedValue({ error: { code: "42501", message: "rls" } });
    const t = new SupabaseEvidenceTransport();
    await expect(t.upload(ITEM, BYTES)).rejects.toThrow(/EVIDENCE_INSERT_FAILED/);
  });

  it("thumbnail failure never blocks the full upload", async () => {
    storageUpload
      .mockResolvedValueOnce({ error: null })            // full image OK
      .mockResolvedValueOnce({ error: { message: "x" } }); // thumb fails
    const t = new SupabaseEvidenceTransport();
    const res = await t.upload(ITEM, BYTES);
    expect(res.thumbnailPath).toBeNull();
    const evRow = evidenceInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(evRow.thumbnail_path).toBeNull();
  });

  it("omits run_id from the bridge when the item has none (insertPhoto self-resolves)", async () => {
    const t = new SupabaseEvidenceTransport();
    await t.upload({ ...ITEM, runId: null }, BYTES);
    const bridge = insertPhoto.mock.calls[0][0] as Record<string, unknown>;
    expect("run_id" in bridge).toBe(false);
  });
});
