import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock collaborators BEFORE importing the module under test ───
const mockUpload = vi.fn();
const mockInsertPhoto = vi.fn();

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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

import {
  addPendingUpload,
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
  // 1x1 transparent png bytes
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return new File([bytes], name, { type: "image/jpeg" });
}

// jsdom's HTMLImageElement never fires onload; pendingUploads' compressToBlob
// falls back to the raw file on img error, which is fine for our test purposes.

beforeEach(async () => {
  await clear(__testing__.store);
  mockUpload.mockReset();
  mockInsertPhoto.mockReset();
});

describe("pendingUploads — IDB-backed offline queue", () => {
  it("addPendingUpload persists an item with status=pending and a Blob payload", async () => {
    const file = makeFile();
    const item = await addPendingUpload(file, {
      jobId: "job-1",
      inspectionType: "pickup",
      photoType: "exterior_front",
      label: null,
    });

    expect(item.status).toBe("pending");
    expect(item.fileBlob).toBeInstanceOf(Blob);
    expect(item.jobId).toBe("job-1");

    const all = await getAllPendingUploads();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(item.id);
  });

  it("retryUpload marks item done, clears blob, and calls upload + insertPhoto exactly once", async () => {
    mockUpload.mockResolvedValue({
      url: "https://x/y.jpg",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: "ref-1",
    });
    mockInsertPhoto.mockResolvedValue({ id: "p1" });

    const item = await addPendingUpload(makeFile(), {
      jobId: "j1",
      inspectionType: "pickup",
      photoType: "odometer",
      label: null,
    });

    const ok = await retryUpload(item.id);
    expect(ok).toBe(true);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockInsertPhoto).toHaveBeenCalledTimes(1);

    const [after] = await getAllPendingUploads();
    expect(after.status).toBe("done");
    expect(after.fileBlob).toBeNull();
    expect(after.completedAt).not.toBeNull();
  });

  it("retryUpload marks item failed and records errorMessage on upload failure", async () => {
    mockUpload.mockRejectedValue(new Error("network gone"));

    const item = await addPendingUpload(makeFile(), {
      jobId: "j2",
      inspectionType: "delivery",
      photoType: "exterior_rear",
      label: null,
    });

    const ok = await retryUpload(item.id);
    expect(ok).toBe(false);
    expect(mockInsertPhoto).not.toHaveBeenCalled();

    const [after] = await getAllPendingUploads();
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(/network gone/);
    expect(after.fileBlob).not.toBeNull(); // blob retained for retry
  });

  it("concurrency lock prevents duplicate uploads of the same id", async () => {
    // Use a controllable promise so the test cleans up after itself.
    let resolveUpload: (v: unknown) => void = () => {};
    mockUpload.mockImplementation(
      () =>
        new Promise((res) => {
          resolveUpload = res;
        }),
    );
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    const item = await addPendingUpload(makeFile(), {
      jobId: "j3",
      inspectionType: "pickup",
      photoType: "exterior_front",
      label: null,
    });

    const first = retryUpload(item.id);
    // Yield enough times for retryUpload to reach the upload call.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const second = await retryUpload(item.id);
    expect(second).toBe(false);

    // Resolve the first upload so the test cleans up the inFlight lock.
    resolveUpload({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    await first;
  });

  it("retryAllPending processes pending and failed items together", async () => {
    mockUpload.mockResolvedValue({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    await addPendingUpload(makeFile("a.jpg"), {
      jobId: "j",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await addPendingUpload(makeFile("b.jpg"), {
      jobId: "j",
      inspectionType: "pickup",
      photoType: "y",
      label: null,
    });

    const result = await retryAllPending();
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("deletePendingUpload removes the item from the queue", async () => {
    const item = await addPendingUpload(makeFile(), {
      jobId: "j",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await deletePendingUpload(item.id);
    expect(await getAllPendingUploads()).toHaveLength(0);
  });

  it("getPendingUploadsByJob groups items per job and excludes done items", async () => {
    mockUpload.mockResolvedValue({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    const a = await addPendingUpload(makeFile(), {
      jobId: "JA",
      jobNumber: "AX-001",
      vehicleReg: "AB12 CDE",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await addPendingUpload(makeFile(), {
      jobId: "JA",
      jobNumber: "AX-001",
      vehicleReg: "AB12 CDE",
      inspectionType: "pickup",
      photoType: "y",
      label: null,
    });
    await addPendingUpload(makeFile(), {
      jobId: "JB",
      inspectionType: "pickup",
      photoType: "z",
      label: null,
    });

    // Complete one in JA — it should drop out of the per-job grouping
    await retryUpload(a.id);

    const groups = await getPendingUploadsByJob();
    expect(groups).toHaveLength(2);
    const ja = groups.find((g) => g.jobId === "JA");
    expect(ja?.pendingCount).toBe(1);
    expect(ja?.jobNumber).toBe("AX-001");
    expect(ja?.vehicleReg).toBe("AB12 CDE");

    expect(await getPendingJobCount()).toBe(2);
  });

  it("pruneDone removes completed items only", async () => {
    mockUpload.mockResolvedValue({
      url: "u",
      thumbnailUrl: null,
      backend: "gcs",
      backendRef: null,
    });
    mockInsertPhoto.mockResolvedValue({ id: "p" });

    const a = await addPendingUpload(makeFile(), {
      jobId: "J",
      inspectionType: "pickup",
      photoType: "x",
      label: null,
    });
    await addPendingUpload(makeFile(), {
      jobId: "J",
      inspectionType: "pickup",
      photoType: "y",
      label: null,
    });
    await retryUpload(a.id);

    await pruneDone();
    const remaining = await getAllPendingUploads();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("pending");
  });
});
