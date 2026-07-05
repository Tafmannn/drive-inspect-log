import { describe, it, expect, beforeEach, vi } from "vitest";

// Isolated: mock the two app-level modules signedUrls would touch, so importing
// the evidence layer never reaches real Supabase. (evidenceStore/uploadQueue
// don't import them, but keep the barrel clean if wiring changes.)
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/mediaResolver", () => ({ resolveMediaUrlAsync: vi.fn() }));

import {
  saveCapture,
  listByJob,
  listByJobStage,
  listByJobStageCategory,
  listPendingWork,
  getItemBytes,
  markUploaded,
  markFailed,
  retry,
  remove,
  itemToView,
} from "@/lib/evidence/evidenceStore";
import { EvidenceUploadQueue } from "@/lib/evidence/uploadQueue";
import { __clearForTests } from "@/lib/evidence/indexedDb";
import { type EvidenceTransport } from "@/lib/evidence/types";

function makeFile(name = "shot.jpg", byte = 0x41): File {
  return new File([new Uint8Array([byte, byte, byte, byte, byte, byte])], name, {
    type: "image/jpeg",
  });
}

const CAP = {
  jobId: "job-1",
  stage: "pickup" as const,
  category: "front" as const,
};

beforeEach(async () => {
  await __clearForTests();
});

describe("evidenceStore — capture & read", () => {
  it("saves a capture as queued and lists it by job/stage/category", async () => {
    const item = await saveCapture({ ...CAP, file: makeFile() });
    expect(item.uploadStatus).toBe("queued");
    expect(item.serverId).toBeNull();
    expect(item.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(item.capturedAt).toBe(item.createdAt);

    expect(await listByJob("job-1")).toHaveLength(1);
    expect(await listByJobStage("job-1", "pickup")).toHaveLength(1);
    expect(await listByJobStageCategory("job-1", "pickup", "front")).toHaveLength(1);
    expect(await listByJobStageCategory("job-1", "pickup", "rear")).toHaveLength(0);

    const bytes = await getItemBytes(item.localId);
    expect(bytes?.bytes.byteLength).toBeGreaterThan(0);
  });

  it("suppresses a duplicate capture (same job/stage/category/hash)", async () => {
    const a = await saveCapture({ ...CAP, file: makeFile("a.jpg", 0x41) });
    const b = await saveCapture({ ...CAP, file: makeFile("b.jpg", 0x41) }); // identical bytes
    expect(b.localId).toBe(a.localId);
    expect(await listByJob("job-1")).toHaveLength(1);
  });

  it("does NOT dedupe different bytes or a different category", async () => {
    await saveCapture({ ...CAP, file: makeFile("a.jpg", 0x41) });
    await saveCapture({ ...CAP, file: makeFile("b.jpg", 0x42) }); // different bytes
    await saveCapture({ ...CAP, category: "rear", file: makeFile("c.jpg", 0x41) });
    expect(await listByJob("job-1")).toHaveLength(3);
  });

  it("throws on an empty input file rather than storing junk", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    await expect(saveCapture({ ...CAP, file: empty })).rejects.toThrow(/empty/i);
  });
});

describe("evidenceStore — status lifecycle", () => {
  it("markUploaded stamps server fields and reclaims bytes", async () => {
    const item = await saveCapture({ ...CAP, file: makeFile() });
    const done = await markUploaded(item.localId, {
      serverId: item.localId,
      storageBucket: "vehicle-photos",
      storagePath: "jobs/job-1/pickup/front/x.jpg",
      thumbnailPath: null,
    });
    expect(done?.uploadStatus).toBe("uploaded");
    expect(done?.serverId).toBe(item.localId);
    expect(await getItemBytes(item.localId)).toBeNull(); // bytes reclaimed
    expect(itemToView(done!).source).toBe("evidence");
  });

  it("markFailed applies capped exponential backoff and increments retryCount", async () => {
    const item = await saveCapture({ ...CAP, file: makeFile() });
    const f1 = await markFailed(item.localId, "network");
    expect(f1?.uploadStatus).toBe("failed");
    expect(f1?.retryCount).toBe(1);
    expect(f1?.nextRetryAt).toBeTruthy();

    const f2 = await markFailed(item.localId, "network");
    expect(f2?.retryCount).toBe(2);
    // backoff grows
    expect(Date.parse(f2!.nextRetryAt!)).toBeGreaterThan(Date.parse(f1!.nextRetryAt!));
  });

  it("retry re-queues and clears backoff", async () => {
    const item = await saveCapture({ ...CAP, file: makeFile() });
    await markFailed(item.localId, "network");
    const re = await retry(item.localId);
    expect(re?.uploadStatus).toBe("queued");
    expect(re?.nextRetryAt).toBeNull();
  });

  it("remove deletes item and bytes", async () => {
    const item = await saveCapture({ ...CAP, file: makeFile() });
    await remove(item.localId);
    expect(await listByJob("job-1")).toHaveLength(0);
    expect(await getItemBytes(item.localId)).toBeNull();
  });
});

describe("evidenceUploadQueue — drain", () => {
  function transport(overrides?: Partial<EvidenceTransport>): EvidenceTransport {
    return {
      upload: vi.fn(async (item) => ({
        serverId: item.localId,
        storageBucket: "vehicle-photos",
        storagePath: `jobs/${item.jobId}/pickup/front/${item.localId}.jpg`,
        thumbnailPath: null,
      })),
      ...overrides,
    };
  }

  it("uploads all queued items and marks them uploaded", async () => {
    await saveCapture({ ...CAP, file: makeFile("a.jpg", 0x41) });
    await saveCapture({ ...CAP, file: makeFile("b.jpg", 0x42) });

    const q = new EvidenceUploadQueue(transport());
    const res = await q.drain();
    expect(res.attempted).toBe(2);
    expect(res.uploaded).toBe(2);
    expect(res.failed).toBe(0);
    expect(await listPendingWork()).toHaveLength(0);
  });

  it("records failures with backoff and leaves items recoverable", async () => {
    await saveCapture({ ...CAP, file: makeFile() });
    const q = new EvidenceUploadQueue(
      transport({ upload: vi.fn(async () => { throw new Error("storage 500"); }) }),
    );
    const res = await q.drain();
    expect(res.failed).toBe(1);
    const pending = await listPendingWork();
    expect(pending).toHaveLength(1);
    expect(pending[0].uploadStatus).toBe("failed");
    expect(pending[0].lastError).toContain("storage 500");
  });

  it("does not re-attempt a failed item while its backoff window is open", async () => {
    const item = await saveCapture({ ...CAP, file: makeFile() });
    await markFailed(item.localId, "network"); // sets nextRetryAt in the future
    const up = vi.fn();
    const q = new EvidenceUploadQueue(transport({ upload: up as never }));
    const res = await q.drain();
    expect(res.attempted).toBe(0);
    expect(up).not.toHaveBeenCalled();
  });
});
