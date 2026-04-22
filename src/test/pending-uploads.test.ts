import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock collaborators BEFORE importing the module under test ───
const mockUpload = vi.fn();
const mockInsertPhoto = vi.fn();
const mockJobsSelect = vi.fn();

vi.mock("@/lib/storage", () => ({
  storageService: {
    uploadImage: (...args: unknown[]) => mockUpload(...args),
  },
}));

vi.mock("@/lib/api", () => ({
  insertPhoto: (...args: unknown[]) => mockInsertPhoto(...args),
}));

vi.mock("@/lib/logger", () => ({
  logClientEvent: vi.fn(),
}));

// Minimal supabase mock — used by run-isolation guard inside retryUpload
// and by purgeStaleRunUploads. We default to "no current run" which means
// the run-id guard treats items as still valid (only items that explicitly
// disagree with a known current run are purged).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "jobs") {
        return {
          select: (..._args: unknown[]) => ({
            eq: () => ({
              maybeSingle: async () => mockJobsSelect(),
            }),
            in: () => ({
              // purgeStaleRunUploads path
              then: undefined,
            }),
          }),
        };
      }
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  },
}));

import {
  stagePendingUpload,
  promoteSubmissionSession,
  discardSubmissionSession,
  getAllPendingUploads,
  retryUpload,
  retryAllPending,
  deletePendingUpload,
  getPendingUploadsByJob,
  getPendingJobCount,
  pruneDone,
  __testing__,
} from "@/lib/pendingUploads";
import { clear } from "idb-keyval";

function makeFile(name = "test.jpg"): File {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return new File([bytes], name, { type: "image/jpeg" });
}

const SESSION_A = "sess-aaaaaaaa-0000-0000-0000-000000000001";

beforeEach(async () => {
  await clear(__testing__.store);
  mockUpload.mockReset();
  mockInsertPhoto.mockReset();
  mockJobsSelect.mockReset();
  // Default: no current run known → run-id guard does not purge.
  mockJobsSelect.mockResolvedValue({ data: { current_run_id: null } });
});

// ─── Staging contract ────────────────────────────────────────────────

describe("pendingUploads — submission-session staging", () => {
  it("stagePendingUpload writes items in state=staged with the session id and Blob payload", async () => {
    const file = makeFile();
    const item = await stagePendingUpload(file, {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "job-1",
      inspectionType: "pickup",
      photoType: "exterior_front",
      label: null,
    });

    expect(item.state).toBe("staged");
    expect(item.status).toBe("pending");
    expect(item.submissionSessionId).toBe(SESSION_A);
    expect(item.fileBlob).toBeInstanceOf(Blob);

    const all = await getAllPendingUploads();
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("staged");
  });

  it("retryUpload REFUSES to upload staged items (worker guard)", async () => {
    mockUpload.mockResolvedValue({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    const item = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "odometer",
      label: null,
    });

    const ok = await retryUpload(item.id);
    expect(ok).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsertPhoto).not.toHaveBeenCalled();

    const [after] = await getAllPendingUploads();
    expect(after.state).toBe("staged");
  });

  it("retryAllPending only processes ready/failed items, never staged", async () => {
    mockUpload.mockResolvedValue({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    await stagePendingUpload(makeFile("staged.jpg"), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });

    const result = await retryAllPending();
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("getPendingUploadsByJob hides staged items from the user-facing pending list", async () => {
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "JA",
      jobNumber: "AX-001",
      vehicleReg: "AB12 CDE",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    const groups = await getPendingUploadsByJob();
    expect(groups).toHaveLength(0);
    expect(await getPendingJobCount()).toBe(0);
  });
});

// ─── Promotion + discard ─────────────────────────────────────────────

describe("pendingUploads — promotion & discard lifecycle", () => {
  it("promoteSubmissionSession atomically flips staged → ready and stamps inspectionId", async () => {
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "exterior_front",
      label: null,
    });
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-2",
      clientDamageId: "dmg-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "damage_close_up",
      label: null,
    });

    const result = await promoteSubmissionSession(SESSION_A, {
      inspectionId: "insp-server-1",
      damageIdMap: { "dmg-1": "di-server-1" },
    });
    expect(result.promoted).toBe(2);

    const all = await getAllPendingUploads();
    expect(all.every((u) => u.state === "ready")).toBe(true);
    expect(all.every((u) => u.inspectionId === "insp-server-1")).toBe(true);
    const dmg = all.find((u) => u.photoType === "damage_close_up");
    expect(dmg?.damageItemId).toBe("di-server-1");
  });

  it("promoteSubmissionSession THROWS when a damage close-up has no server id (linkage failure)", async () => {
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      clientDamageId: "dmg-orphan",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "damage_close_up",
      label: null,
    });

    await expect(
      promoteSubmissionSession(SESSION_A, {
        inspectionId: "insp-server-1",
        damageIdMap: {}, // empty — no mapping for dmg-orphan
      }),
    ).rejects.toThrow(/LINKAGE_PATCH_FAILED/);

    // No items were promoted — they remain staged so the caller can discard.
    const all = await getAllPendingUploads();
    expect(all.every((u) => u.state === "staged")).toBe(true);
  });

  it("discardSubmissionSession removes ALL items for the session — no orphan survivors", async () => {
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-2",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "y",
      label: null,
    });

    const { discarded } = await discardSubmissionSession(SESSION_A);
    expect(discarded).toBe(2);
    expect(await getAllPendingUploads()).toHaveLength(0);
  });

  it("after promote → ready, retryUpload uploads exactly once and clears the blob", async () => {
    mockUpload.mockResolvedValue({
      url: "https://x/y.jpg",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: "ref-1",
    });
    mockInsertPhoto.mockResolvedValue({ id: "p1" });

    const item = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "odometer",
      label: null,
    });
    await promoteSubmissionSession(SESSION_A, {
      inspectionId: "insp-1",
      damageIdMap: {},
    });

    const ok = await retryUpload(item.id);
    expect(ok).toBe(true);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockInsertPhoto).toHaveBeenCalledTimes(1);

    const [after] = await getAllPendingUploads();
    expect(after.state).toBe("uploaded");
    expect(after.fileBlob).toBeNull();
  });
});

// ─── Stale-staged TTL ────────────────────────────────────────────────

describe("pendingUploads — stale staged TTL", () => {
  it("auto-purges staged items older than STAGED_TTL_MS on next load", async () => {
    const item = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });

    // Simulate time travel by rewriting createdAt directly in the store.
    const all = await __testing__.loadAll();
    const idx = all.findIndex((u) => u.id === item.id);
    all[idx] = {
      ...all[idx],
      createdAt: new Date(Date.now() - (__testing__.STAGED_TTL_MS + 60_000)).toISOString(),
    };
    await __testing__.saveAll(all);

    const survivors = await getAllPendingUploads();
    expect(survivors).toHaveLength(0);
  });
});

// ─── Misc preserved coverage ─────────────────────────────────────────

describe("pendingUploads — misc operations", () => {
  it("deletePendingUpload removes the item from the queue", async () => {
    const item = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-1",
      jobId: "j",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await deletePendingUpload(item.id);
    expect(await getAllPendingUploads()).toHaveLength(0);
  });

  it("pruneDone removes uploaded items only", async () => {
    mockUpload.mockResolvedValue({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    const itemA = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-a",
      jobId: "J",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION_A,
      clientPhotoId: "cpid-b",
      jobId: "J",
      inspectionType: "pickup",
      photoType: "y",
      label: null,
    });
    await promoteSubmissionSession(SESSION_A, {
      inspectionId: "i1",
      damageIdMap: {},
    });
    await retryUpload(itemA.id);

    await pruneDone();
    const remaining = await getAllPendingUploads();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].state).toBe("ready");
  });
});
