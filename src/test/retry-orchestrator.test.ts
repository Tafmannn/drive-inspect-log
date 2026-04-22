// Tests for retryOrchestrator structured outcomes.
//
// Verifies the manual-retry contract relied on by the Pending Uploads
// screen for honest feedback:
//   - completed       → real run with succeeded/failed/purged counts
//   - skipped_inflight → second call while first is still running
//   - skipped_backoff  → second call within the jitter floor
//   - failed          → underlying queue helper threw
//
// Timing is deterministic: we inject sleep + jitter helpers so tests
// don't depend on real wall-clock waits.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetryAll = vi.fn();
const mockRetryJob = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  retryAllPending: (...args: unknown[]) => mockRetryAll(...args),
  retryJobUploads: (...args: unknown[]) => mockRetryJob(...args),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));
vi.mock("@/lib/evidenceQueueBus", () => ({
  notifyEvidenceQueueChanged: vi.fn(),
}));

import {
  triggerRetry,
  __resetRetryOrchestratorForTests,
  __setRetryTimingForTests,
} from "@/lib/retryOrchestrator";

beforeEach(() => {
  mockRetryAll.mockReset();
  mockRetryJob.mockReset();
  mockRetryAll.mockResolvedValue({ succeeded: 0, failed: 0, purged: 0 });
  mockRetryJob.mockResolvedValue({ succeeded: 0, failed: 0 });
  __resetRetryOrchestratorForTests();
  // Zero jitter, instant sleep — fully deterministic.
  __setRetryTimingForTests({
    sleep: () => Promise.resolve(),
    jitter: () => 0,
  });
});

describe("retryOrchestrator outcomes (Retry All)", () => {
  it("returns completed with counts on a successful run", async () => {
    mockRetryAll.mockResolvedValueOnce({ succeeded: 3, failed: 1, purged: 0 });
    const r = await triggerRetry("manual");
    expect(r.outcome).toBe("completed");
    expect(r.succeeded).toBe(3);
    expect(r.failed).toBe(1);
  });

  it("returns skipped_inflight when a run is already in flight", async () => {
    let resolveInner: ((v: unknown) => void) | null = null;
    mockRetryAll.mockImplementationOnce(
      () => new Promise((res) => { resolveInner = res; }),
    );

    const first = triggerRetry("manual");
    // Yield once so the first call passes the (zero) sleep and enters
    // retryAllPending, occupying the in-flight latch.
    await Promise.resolve();
    await Promise.resolve();

    const second = await triggerRetry("manual");
    expect(second.outcome).toBe("skipped_inflight");

    resolveInner!({ succeeded: 0, failed: 0, purged: 0 });
    await first;
  });

  it("returns skipped_backoff inside the jitter floor", async () => {
    const first = await triggerRetry("manual");
    expect(first.outcome).toBe("completed");

    const second = await triggerRetry("manual");
    expect(second.outcome).toBe("skipped_backoff");
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns failed when retryAllPending throws", async () => {
    mockRetryAll.mockRejectedValueOnce(new Error("boom"));
    const r = await triggerRetry("manual");
    expect(r.outcome).toBe("failed");
    expect(r.error).toBe("boom");
  });
});

describe("retryOrchestrator outcomes (per-job Retry)", () => {
  it("routes per-job retry through retryJobUploads, not retryAllPending", async () => {
    mockRetryJob.mockResolvedValueOnce({ succeeded: 2, failed: 0 });
    const r = await triggerRetry("manual_job", "job-xyz");
    expect(mockRetryJob).toHaveBeenCalledWith("job-xyz");
    expect(mockRetryAll).not.toHaveBeenCalled();
    expect(r.outcome).toBe("completed");
    expect(r.succeeded).toBe(2);
    expect(r.purged).toBe(0);
  });

  it("per-job retry honours the same single-flight latch as Retry All", async () => {
    let resolveInner: ((v: unknown) => void) | null = null;
    mockRetryJob.mockImplementationOnce(
      () => new Promise((res) => { resolveInner = res; }),
    );

    const first = triggerRetry("manual_job", "job-1");
    await Promise.resolve();
    await Promise.resolve();

    const second = await triggerRetry("manual_job", "job-1");
    expect(second.outcome).toBe("skipped_inflight");

    resolveInner!({ succeeded: 0, failed: 0 });
    await first;
  });
});
