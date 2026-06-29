import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks (mirror pending-uploads.test.ts) ───────────────────────────────
const mockUpload = vi.fn();
const mockInsertPhoto = vi.fn();
const mockJobsSelect = vi.fn();

vi.mock("@/lib/storage", () => ({
  storageService: { uploadImage: (...a: unknown[]) => mockUpload(...a) },
}));
vi.mock("@/lib/api", () => ({
  insertPhoto: (...a: unknown[]) => mockInsertPhoto(...a),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => mockJobsSelect() }),
        in: () => ({ then: undefined }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

import {
  stagePendingUpload,
  promoteSubmissionSession,
  discardSubmissionSession,
  getAllPendingUploads,
  getPendingUploadsByJob,
  retryUpload,
  type PendingUpload,
  __testing__,
} from "@/lib/pendingUploads";
import { clear } from "idb-keyval";

function makeFile(name = "t.jpg", bytes = [0x89, 0x50, 0x4e, 0x47]): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}
const SESSION_A = "sess-aaaaaaaa-0000-0000-0000-000000000001";
const SESSION_B = "sess-bbbbbbbb-0000-0000-0000-000000000002";

beforeEach(async () => {
  await clear(__testing__.store);
  mockUpload.mockReset();
  mockInsertPhoto.mockReset();
  mockJobsSelect.mockReset();
  mockJobsSelect.mockResolvedValue({ data: { current_run_id: null } });
});

async function stageAndReady(clientPhotoId: string, jobId = "J"): Promise<PendingUpload> {
  const item = await stagePendingUpload(makeFile(), {
    submissionSessionId: SESSION_A,
    clientPhotoId,
    jobId,
    inspectionType: "pickup",
    photoType: "exterior_front",
    label: null,
  });
  await promoteSubmissionSession(SESSION_A, { inspectionId: "insp-1", damageIdMap: {} });
  return item;
}

// ── V4: missing blob must NOT be silently treated as a successful upload ──
describe("V4 — null blob is a hard failure, not a silent success", () => {
  it("retryUpload on a ready item whose blob is null marks it failed (no upload, no insert)", async () => {
    const item = await stageAndReady("cp-null");
    // Null out the blob on disk to simulate a lost/legacy payload.
    const all = await __testing__.loadAll();
    await __testing__.saveAll(all.map((u) => (u.id === item.id ? { ...u, fileBlob: null } : u)));

    const ok = await retryUpload(item.id);
    expect(ok).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsertPhoto).not.toHaveBeenCalled();

    const [after] = await getAllPendingUploads();
    expect(after.state).toBe("failed");
    expect(after.needsAttention).toBe(true);
  });
});

// ── V7: 0-byte uploads are rejected at the storage layer ──
// (The retryUpload client guard `fileBlob.size === 0` also covers this in a
//  real browser; fake-indexeddb does not round-trip empty Blobs faithfully,
//  so we assert the authoritative storage-layer guard here.)
describe("V7 — empty (0-byte) upload is rejected by the storage service", () => {
  it("internalStorageService.uploadImage throws on a 0-byte file", async () => {
    const { internalStorageService } = await import("@/lib/internalStorageService");
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    await expect(
      internalStorageService.uploadImage(empty, "jobs/J/pickup/odometer/x"),
    ).rejects.toThrow(/empty/i);
  });
});

// ── V2: items stranded in "uploading" are recovered, not silently lost ──
describe("V2 — stranded 'uploading' items are re-armed on load", () => {
  it("re-arms a stale 'uploading' item back to 'ready' and surfaces it", async () => {
    const stale: PendingUpload = {
      id: "pu_stale",
      jobId: "JX",
      jobNumber: "AX-9",
      vehicleReg: null,
      inspectionType: "pickup",
      photoType: "odometer",
      label: null,
      createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      completedAt: null,
      status: "uploading",
      state: "uploading",
      uploadingSince: new Date(Date.now() - (__testing__.STALE_UPLOADING_MS + 60_000)).toISOString(),
      fileBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      fileName: "x.jpg",
      inspectionId: "insp-x",
      submissionSessionId: SESSION_A,
    };
    await __testing__.saveAll([stale]);

    const survivors = await getAllPendingUploads();
    expect(survivors).toHaveLength(1);
    expect(survivors[0].state).toBe("ready");

    // And it is now visible to the user (was hidden while "uploading").
    const groups = await getPendingUploadsByJob();
    expect(groups.find((g) => g.jobId === "JX")?.pendingCount).toBe(1);
  });

  it("does NOT re-arm a fresh 'uploading' item (within threshold)", async () => {
    const fresh: PendingUpload = {
      id: "pu_fresh",
      jobId: "JY",
      jobNumber: null,
      vehicleReg: null,
      inspectionType: "pickup",
      photoType: "odometer",
      label: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      status: "uploading",
      state: "uploading",
      uploadingSince: new Date().toISOString(),
      fileBlob: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
      fileName: "y.jpg",
      inspectionId: "insp-y",
      submissionSessionId: SESSION_A,
    };
    await __testing__.saveAll([fresh]);
    const [after] = await getAllPendingUploads();
    expect(after.state).toBe("uploading");
  });
});

// ── V3: concurrent queue mutations must not lose updates ──
describe("V3 — queue mutations are serialized (no lost updates)", () => {
  it("20 concurrent updateOne increments all apply (no clobber)", async () => {
    const item = await stageAndReady("cp-conc");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        __testing__.updateOne(item.id, (u) => ({ ...u, attempts: (u.attempts ?? 0) + 1 })),
      ),
    );
    const [after] = await getAllPendingUploads();
    expect(after.attempts).toBe(20);
  });

  it("a concurrent promote(A) + discard(B) both take effect", async () => {
    const a = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cp-a",
      jobId: "J",
      inspectionType: "pickup",
      photoType: "exterior_front",
      label: null,
    });
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_B,
      clientPhotoId: "cp-b",
      jobId: "J",
      inspectionType: "pickup",
      photoType: "exterior_rear",
      label: null,
    });

    await Promise.all([
      promoteSubmissionSession(SESSION_A, { inspectionId: "insp-1", damageIdMap: {} }),
      discardSubmissionSession(SESSION_B),
    ]);

    const all = await getAllPendingUploads();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(a.id);
    expect(all[0].state).toBe("ready");
  });
});
