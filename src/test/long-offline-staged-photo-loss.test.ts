// @vitest-environment jsdom
//
// Full failure-recovery / transaction-integrity check: a driver takes photos
// and taps Submit, but the device stays offline for a LONG period (the
// submission queues in submitQueue.ts). Does the job ever converge to a
// state with no lost data?
//
// This test uses the REAL submitQueue.ts and pendingUploads.ts together
// (not mocked against each other) because the bug lived in their
// interaction, not in either module alone:
//
//   - pendingUploads.ts purges any photo still in state "staged" once it's
//     older than STAGED_TTL_MS (30 min) — a defence against zombie staged
//     items from a crash BEFORE the submit was ever queued.
//   - submitQueue.ts's queued submission has no such TTL — it waits
//     patiently for connectivity, however long that takes.
//
// Before the fix: if the device was offline for longer than 30 minutes, the
// staged photos got purged by the first TTL sweep while the submission
// itself was still sitting in the queue waiting for connectivity. When
// connectivity returned and the queue finally drained: submit_inspection's
// RPC still succeeded (it never touches photos), promoteSubmissionSession()
// found zero staged items left to promote and returned {promoted: 0} — NOT
// an error — and drainOne() never checked that return value. The
// inspection committed, the queue entry was removed as "succeeded", and the
// driver/admin had no idea every photo from that inspection was gone. No
// error, no retry, no trace — just an inspection with zero evidence.
//
// Fix (pendingUploads.ts loadAll()): the staged-TTL purge now skips any
// staged item whose submissionSessionId has a live entry in submitQueue.ts's
// queue, so evidence for a submission that's merely waiting for
// connectivity is never discarded out from under it. A genuinely abandoned
// staging session (no live queue entry — the driver staged photos but never
// tapped Submit) is still purged, preserving STAGED_TTL_MS's original
// protective intent.
//
// Note on timers: this test backdates the stored createdAt timestamp
// directly (via the real loadAll/saveAll used internally) to simulate 45
// minutes of elapsed time, rather than using vi.useFakeTimers(). Staging
// goes through compressToBlob, which retries with real setTimeout backoff
// before falling back to the original file under jsdom (no real canvas/
// image decoding); fake-indexeddb also relies on real timer ticks
// internally. Both make fake timers unreliable here, and backdating the
// timestamp exercises the exact same age-comparison code path in loadAll()
// without fighting either library.
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockUpload = vi.fn();
const mockRpc = vi.fn();
const mockInsertPhoto = vi.fn();

vi.mock("@/lib/storage", () => ({
  storageService: { uploadImage: (...args: unknown[]) => mockUpload(...args) },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
vi.mock("@/lib/api", () => ({
  insertPhoto: (...args: unknown[]) => mockInsertPhoto(...args),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));
vi.mock("@/lib/pushApi", () => ({ notifyPodSubmitted: vi.fn() }));
vi.mock("@/lib/evidenceQueueBus", () => ({ notifyEvidenceQueueChanged: vi.fn() }));
vi.mock("@/lib/retryOrchestrator", () => ({ triggerRetry: vi.fn() }));

import { enqueueSubmission, drainSubmitQueue, __resetSubmitQueueForTests } from "@/lib/submitQueue";
import {
  stagePendingUpload,
  getAllPendingUploads,
  __testing__ as pendingTesting,
} from "@/lib/pendingUploads";
import { clear } from "idb-keyval";

function makePhotoFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/jpeg" });
}

// Backdates createdAt for every staged item belonging to a session, via the
// module's own raw load/save, to simulate STAGED_TTL_MS + margin having
// elapsed without touching global timers.
async function backdateSession(sessionId: string, ageMs: number) {
  const all = await pendingTesting.loadAll();
  const next = all.map((u) =>
    u.submissionSessionId === sessionId
      ? { ...u, createdAt: new Date(Date.now() - ageMs).toISOString() }
      : u,
  );
  await pendingTesting.saveAll(next);
}

beforeEach(async () => {
  await clear(pendingTesting.store);
  await __resetSubmitQueueForTests();
  mockUpload.mockReset();
  mockRpc.mockReset();
  mockInsertPhoto.mockReset();
});

describe("long offline period — staged-photo TTL vs. queued submission", () => {
  it("FIXED: photos staged before a long-offline submit survive the TTL sweep and are still available when the queue drains", async () => {
    const sessionId = "sess-long-offline-1";
    const jobId = "job-1";

    // Driver captures 2 photos during the walk-around, staged under this
    // submission session, then taps Submit — which enqueues the full
    // submission (this test models the network being down at tap time).
    await stagePendingUpload(makePhotoFile("front.jpg"), {
      submissionSessionId: sessionId, clientPhotoId: "cp-1", jobId,
      inspectionType: "pickup", photoType: "pickup_exterior_front", label: null,
    });
    await stagePendingUpload(makePhotoFile("rear.jpg"), {
      submissionSessionId: sessionId, clientPhotoId: "cp-2", jobId,
      inspectionType: "pickup", photoType: "pickup_exterior_rear", label: null,
    });

    await enqueueSubmission({
      submissionSessionId: sessionId, jobId, jobNumber: "AX0001", vehicleReg: "AB12CDE",
      inspectionType: "pickup", runId: "run-1",
      inspectionPayload: {}, damageItems: [],
      driverSignatureBlob: null, customerSignatureBlob: null,
      driverSignatureUrl: "https://x/driver.png", customerSignatureUrl: "https://x/customer.png",
      damageClientIdOrder: [],
    });

    // The device stays offline for 45 minutes — longer than STAGED_TTL_MS
    // (30 min) — before connectivity returns. Something (a screen wake, a
    // background timer, the Pending Uploads screen) reads the pending
    // queue during that window, exactly as the real app's polling/visible
    // surfaces do — that's what actually runs the TTL sweep.
    await backdateSession(sessionId, 45 * 60 * 1000);
    await getAllPendingUploads(); // runs the staged-TTL sweep

    // The photos must SURVIVE: their submission is still live in
    // submitQueue.ts, so the TTL purge must skip them.
    const stagedNow = (await getAllPendingUploads()).filter((u) => u.submissionSessionId === sessionId);
    expect(stagedNow).toHaveLength(2);
    expect(stagedNow.every((u) => u.state === "staged")).toBe(true);

    // Connectivity returns; the queue drains and the RPC succeeds.
    mockRpc.mockResolvedValueOnce({
      data: { inspectionId: "insp-1", damageItemIds: [], idempotentReplay: false },
      error: null,
    });
    const result = await drainSubmitQueue();

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    // The evidence must have been promoted (no longer "staged") and linked
    // to the real server-side inspection — not silently dropped.
    const afterDrain = (await getAllPendingUploads()).filter((u) => u.submissionSessionId === sessionId);
    expect(afterDrain).toHaveLength(2);
    expect(afterDrain.every((u) => u.state !== "staged")).toBe(true);
    expect(afterDrain.every((u) => u.inspectionId === "insp-1")).toBe(true);
  });

  it("genuinely abandoned staged photos (no live queue entry) are still purged after STAGED_TTL_MS, preserving the original protection", async () => {
    const sessionId = "sess-abandoned-1";
    const jobId = "job-2";

    // Driver stages photos but the app is closed/crashes BEFORE Submit is
    // ever tapped — no enqueueSubmission call, so no submitQueue entry
    // exists for this session.
    await stagePendingUpload(makePhotoFile("front.jpg"), {
      submissionSessionId: sessionId, clientPhotoId: "cp-3", jobId,
      inspectionType: "pickup", photoType: "pickup_exterior_front", label: null,
    });

    await backdateSession(sessionId, 45 * 60 * 1000);
    await getAllPendingUploads(); // runs the staged-TTL sweep

    const stagedNow = (await getAllPendingUploads()).filter((u) => u.submissionSessionId === sessionId);
    expect(stagedNow).toHaveLength(0);
  });
});
