/**
 * Stage 3 — offline upload safety + run-isolation tests.
 *
 * These tests lock down the run-id contract enforced by retryUpload and
 * the integration with evidenceHealth. They complement (not replace)
 * `pending-uploads.test.ts` which covers the staging lifecycle.
 *
 * Hard rules under test
 * ──────────────────────
 *   • retryUpload preserves the queued runId end-to-end and passes it to
 *     insertPhoto verbatim — no "guessed" current_run_id substitution.
 *   • If the queued runId differs from the job's current_run_id (job has
 *     been reopened), the item is purged from the queue. It MUST NOT be
 *     inserted into the new run's evidence.
 *   • If the run cannot be verified (network/RLS), the item is marked
 *     "blocked" and surfaced — never uploaded under uncertainty.
 *   • Retrying an already-uploaded item is a no-op (idempotency).
 *   • A failed upload feeds evidenceHealth as `failed_uploads` blocker.
 *   • A successful upload transitions state→uploaded and clears the blob.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => mockJobsSelect(),
            }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      return { update: () => ({ eq: async () => ({ error: null }) }) };
    },
  },
}));

import {
  stagePendingUpload,
  promoteSubmissionSession,
  retryUpload,
  getAllPendingUploads,
  __testing__,
} from "@/lib/pendingUploads";
import { evaluateEvidenceHealth } from "@/lib/evidenceHealth";
import { clear } from "idb-keyval";

const SESSION = "sess-stage3-0000-0000-0000-000000000001";
const RUN_QUEUED = "run-queued-aaaa";
const RUN_CURRENT_DIFFERENT = "run-current-bbbb";

function makeFile(name = "x.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

async function stageReady(opts: { runId: string | null; jobId?: string }) {
  const item = await stagePendingUpload(makeFile(), {
    submissionSessionId: SESSION,
    clientPhotoId: "cpid-1",
    jobId: opts.jobId ?? "job-stage3",
    inspectionType: "pickup",
    photoType: "pickup_exterior_front",
    label: null,
    runId: opts.runId,
  });
  await promoteSubmissionSession(SESSION, {
    inspectionId: "insp-1",
    damageIdMap: {},
  });
  return item;
}

beforeEach(async () => {
  await clear(__testing__.store);
  mockUpload.mockReset();
  mockInsertPhoto.mockReset();
  mockJobsSelect.mockReset();
  mockUpload.mockResolvedValue({
    url: "https://x/y.jpg",
    thumbnailUrl: null,
    backend: "gcs",
    backendRef: "ref-stage3",
  });
  mockInsertPhoto.mockResolvedValue({ id: "p1" });
});

describe("Stage 3 — queued runId preservation", () => {
  it("retryUpload passes the queued runId to insertPhoto verbatim", async () => {
    mockJobsSelect.mockResolvedValue({ data: { current_run_id: RUN_QUEUED } });

    const item = await stageReady({ runId: RUN_QUEUED });
    const ok = await retryUpload(item.id);

    expect(ok).toBe(true);
    expect(mockInsertPhoto).toHaveBeenCalledTimes(1);
    const arg = mockInsertPhoto.mock.calls[0][0];
    expect(arg.run_id).toBe(RUN_QUEUED);
    // Make sure we did NOT substitute "current" guessing.
    expect(arg.run_id).not.toBe(RUN_CURRENT_DIFFERENT);
  });

  it("retryUpload omits run_id when the queue item carries none (legacy fallback)", async () => {
    mockJobsSelect.mockResolvedValue({ data: { current_run_id: null } });

    const item = await stageReady({ runId: null });
    const ok = await retryUpload(item.id);

    expect(ok).toBe(true);
    const arg = mockInsertPhoto.mock.calls[0][0];
    // Legacy items without a queued runId must NOT have a guessed run_id
    // injected by the queue worker — server-side resolution owns that path.
    expect(arg).not.toHaveProperty("run_id");
  });
});

describe("Stage 3 — stale-run safety", () => {
  it("purges a queued item whose runId no longer matches the job's current_run_id", async () => {
    mockJobsSelect.mockResolvedValue({
      data: { current_run_id: RUN_CURRENT_DIFFERENT },
    });

    const item = await stageReady({ runId: RUN_QUEUED });
    const ok = await retryUpload(item.id);

    expect(ok).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsertPhoto).not.toHaveBeenCalled();
    // The item is purged outright — must not survive to bleed into POD.
    const all = await getAllPendingUploads();
    expect(all.find((u) => u.id === item.id)).toBeUndefined();
  });

  it("blocks (does not upload, does not purge) when the run cannot be verified", async () => {
    mockJobsSelect.mockRejectedValue(new Error("network down"));

    const item = await stageReady({ runId: RUN_QUEUED });
    const ok = await retryUpload(item.id);

    expect(ok).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsertPhoto).not.toHaveBeenCalled();
    const [after] = await getAllPendingUploads();
    expect(after.id).toBe(item.id);
    expect(after.state).toBe("blocked");
    expect(after.errorMessage).toMatch(/Run unverified/i);
  });
});

describe("Stage 3 — retry idempotency", () => {
  it("does not insert a duplicate photo row when retried after success", async () => {
    mockJobsSelect.mockResolvedValue({ data: { current_run_id: RUN_QUEUED } });

    const item = await stageReady({ runId: RUN_QUEUED });
    const first = await retryUpload(item.id);
    const second = await retryUpload(item.id);

    expect(first).toBe(true);
    // Once "uploaded", the worker refuses to touch the item again.
    expect(second).toBe(false);
    expect(mockInsertPhoto).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });
});

describe("Stage 3 — successful upload state transition", () => {
  it("flips state→uploaded, clears the blob, and stamps backend metadata", async () => {
    mockJobsSelect.mockResolvedValue({ data: { current_run_id: RUN_QUEUED } });

    const item = await stageReady({ runId: RUN_QUEUED });
    await retryUpload(item.id);

    const [after] = await getAllPendingUploads();
    expect(after.state).toBe("uploaded");
    expect(after.status).toBe("done");
    expect(after.fileBlob).toBeNull();
    expect(after.backendRef).toBe("ref-stage3");
  });
});

describe("Stage 3 — failed upload propagates to evidenceHealth", () => {
  it("a failed upload becomes a failed_uploads blocker in evidenceHealth", async () => {
    mockJobsSelect.mockResolvedValue({ data: { current_run_id: RUN_QUEUED } });
    mockUpload.mockRejectedValueOnce(new Error("storage 503"));

    const item = await stageReady({ runId: RUN_QUEUED });
    const ok = await retryUpload(item.id);
    expect(ok).toBe(false);

    const [after] = await getAllPendingUploads();
    expect(after.state).toBe("failed");

    // evidenceHealth treats failedCount > 0 as a hard blocker.
    const health = evaluateEvidenceHealth({
      currentRunId: RUN_QUEUED,
      photos: [],
      inspections: [],
      pendingUploads: { failedCount: 1 },
      requirePickup: false,
      requireDelivery: false,
    });
    expect(health.canUseForPod).toBe(false);
    expect(health.canCloseJob).toBe(false);
    expect(health.canInvoice).toBe(false);
    expect(health.blockers.find((b) => b.code === "failed_uploads")).toBeTruthy();
  });
});
