import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock collaborators BEFORE importing the module under test ───
const mockUpload = vi.fn();
const mockRpc = vi.fn();
const mockPromote = vi.fn();

vi.mock("@/lib/storage", () => ({
  storageService: { uploadImage: (...args: unknown[]) => mockUpload(...args) },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

vi.mock("@/lib/pendingUploads", () => ({
  promoteSubmissionSession: (...args: unknown[]) => mockPromote(...args),
}));

vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));

import {
  enqueueSubmission,
  loadAllSubmissions,
  retrySubmission,
  drainSubmitQueue,
  SUBMIT_STUCK_TIMEOUT_MS,
  __resetSubmitQueueForTests,
} from "@/lib/submitQueue";
import { get, set, createStore } from "idb-keyval";

// Same store name/version submitQueue.ts uses internally — lets the test
// reach into the raw persisted queue the same way submitQueue.ts does.
const store = createStore("axentra-submit-queue", "v1");
const QUEUE_KEY = "submitQueue";

function baseArgs(overrides: Partial<Parameters<typeof enqueueSubmission>[0]> = {}) {
  return {
    submissionSessionId: "sess-1",
    jobId: "job-1",
    jobNumber: "AX0001",
    vehicleReg: "AB12CDE",
    inspectionType: "pickup" as const,
    runId: null,
    inspectionPayload: {},
    damageItems: [],
    driverSignatureBlob: null,
    customerSignatureBlob: null,
    driverSignatureUrl: "https://example.test/driver.png",
    customerSignatureUrl: "https://example.test/customer.png",
    damageClientIdOrder: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetSubmitQueueForTests();
  mockUpload.mockReset();
  mockRpc.mockReset();
  mockPromote.mockReset();
  mockPromote.mockResolvedValue({ promoted: 0 });
});

describe("submitQueue — stranded 'submitting' recovery (WORKFLOW-005 class)", () => {
  it("re-arms a submitting entry to failed once it exceeds SUBMIT_STUCK_TIMEOUT_MS", async () => {
    const entry = await enqueueSubmission(baseArgs());

    const all = await get<typeof entry[]>(QUEUE_KEY, store);
    const idx = all!.findIndex((q) => q.id === entry.id);
    all![idx] = {
      ...all![idx],
      status: "submitting",
      submittingStartedAt: new Date(Date.now() - (SUBMIT_STUCK_TIMEOUT_MS + 60_000)).toISOString(),
    };
    await set(QUEUE_KEY, all, store);

    const reloaded = await loadAllSubmissions();
    const found = reloaded.find((q) => q.id === entry.id);
    expect(found?.status).toBe("failed");
    expect(found?.lastError).toMatch(/interrupted/i);
  });

  it("re-arms a submitting entry with no submittingStartedAt (predates the fix)", async () => {
    const entry = await enqueueSubmission(baseArgs());
    const all = await get<typeof entry[]>(QUEUE_KEY, store);
    const idx = all!.findIndex((q) => q.id === entry.id);
    all![idx] = { ...all![idx], status: "submitting", submittingStartedAt: undefined };
    await set(QUEUE_KEY, all, store);

    const reloaded = await loadAllSubmissions();
    expect(reloaded.find((q) => q.id === entry.id)?.status).toBe("failed");
  });

  it("leaves a genuinely recent submitting entry alone (does not race a live drain)", async () => {
    const entry = await enqueueSubmission(baseArgs());
    const all = await get<typeof entry[]>(QUEUE_KEY, store);
    const idx = all!.findIndex((q) => q.id === entry.id);
    all![idx] = {
      ...all![idx],
      status: "submitting",
      submittingStartedAt: new Date(Date.now() - 5_000).toISOString(),
    };
    await set(QUEUE_KEY, all, store);

    const reloaded = await loadAllSubmissions();
    expect(reloaded.find((q) => q.id === entry.id)?.status).toBe("submitting");
  });

  it("a re-armed (failed) entry is picked up by the next auto-drain and succeeds", async () => {
    const entry = await enqueueSubmission(baseArgs());
    const all = await get<typeof entry[]>(QUEUE_KEY, store);
    const idx = all!.findIndex((q) => q.id === entry.id);
    all![idx] = {
      ...all![idx],
      status: "submitting",
      submittingStartedAt: new Date(Date.now() - (SUBMIT_STUCK_TIMEOUT_MS + 60_000)).toISOString(),
    };
    await set(QUEUE_KEY, all, store);

    mockRpc.mockResolvedValue({ data: { inspectionId: "insp-1", damageItemIds: [] }, error: null });

    const result = await drainSubmitQueue();
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    const remaining = await loadAllSubmissions();
    expect(remaining.find((q) => q.id === entry.id)).toBeUndefined(); // removed on success
  });

  it("a re-armed entry is also retryable manually via retrySubmission", async () => {
    const entry = await enqueueSubmission(baseArgs());
    const all = await get<typeof entry[]>(QUEUE_KEY, store);
    const idx = all!.findIndex((q) => q.id === entry.id);
    all![idx] = {
      ...all![idx],
      status: "submitting",
      submittingStartedAt: new Date(Date.now() - (SUBMIT_STUCK_TIMEOUT_MS + 60_000)).toISOString(),
    };
    await set(QUEUE_KEY, all, store);

    mockRpc.mockResolvedValue({ data: { inspectionId: "insp-1", damageItemIds: [] }, error: null });

    await expect(retrySubmission(entry.id)).resolves.toBeUndefined();
    const remaining = await loadAllSubmissions();
    expect(remaining.find((q) => q.id === entry.id)).toBeUndefined();
  });
});
