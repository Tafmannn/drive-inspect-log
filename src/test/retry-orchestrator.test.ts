// Tests for retryOrchestrator: scoped concurrency + cooldown contract.
//
// Verifies the retry contract relied on by Pending Uploads UI for honest
// feedback, and the scoped locks/cooldown that keep manual taps
// responsive while background triggers stay storm-protected:
//
//   - completed         → real run with succeeded/failed/purged counts
//   - skipped_inflight  → conflict with same-scope in-flight retry
//   - skipped_backoff   → inside global anti-storm cooldown
//   - failed            → underlying queue helper threw
//
// Timing is deterministic: sleep + jitter helpers are injected so tests
// don't depend on real wall-clock waits.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetryAll = vi.fn();
const mockRetryJob = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  retryAllPending: (...args: unknown[]) => mockRetryAll(...args),
  retryJobUploads: (...args: unknown[]) => mockRetryJob(...args),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));

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
  __setRetryTimingForTests({
    sleep: () => Promise.resolve(),
    jitter: () => 0,
  });
});

describe("retryOrchestrator outcomes (Retry All)", () => {
  it("returns completed with counts on a successful run", async () => {
    mockRetryAll.mockResolvedValueOnce({ succeeded: 3, failed: 1, purged: 0 });
    const r = await triggerRetry("manual_all");
    expect(r.outcome).toBe("completed");
    expect(r.succeeded).toBe(3);
    expect(r.failed).toBe(1);
  });

  it("returns skipped_inflight when a global run is already in flight", async () => {
    let resolveInner: ((v: unknown) => void) | null = null;
    mockRetryAll.mockImplementationOnce(
      () => new Promise((res) => { resolveInner = res; }),
    );

    const first = triggerRetry("manual_all");
    await Promise.resolve();
    await Promise.resolve();

    const second = await triggerRetry("manual_all");
    expect(second.outcome).toBe("skipped_inflight");

    resolveInner!({ succeeded: 0, failed: 0, purged: 0 });
    await first;
  });

  it("returns skipped_backoff inside the global cooldown floor", async () => {
    const first = await triggerRetry("manual_all");
    expect(first.outcome).toBe("completed");

    const second = await triggerRetry("online");
    expect(second.outcome).toBe("skipped_backoff");
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns failed when retryAllPending throws", async () => {
    mockRetryAll.mockRejectedValueOnce(new Error("boom"));
    const r = await triggerRetry("manual_all");
    expect(r.outcome).toBe("failed");
    expect(r.error).toBe("boom");
  });

  it("treats legacy 'manual' source as manual_all", async () => {
    mockRetryAll.mockResolvedValueOnce({ succeeded: 1, failed: 0, purged: 0 });
    const r = await triggerRetry("manual");
    expect(r.outcome).toBe("completed");
    expect(mockRetryAll).toHaveBeenCalled();
  });
});

describe("retryOrchestrator scoped locks (per-job)", () => {
  it("routes per-job retry through retryJobUploads, not retryAllPending", async () => {
    mockRetryJob.mockResolvedValueOnce({ succeeded: 2, failed: 0 });
    const r = await triggerRetry("manual_job", "job-xyz");
    expect(mockRetryJob).toHaveBeenCalledWith("job-xyz");
    expect(mockRetryAll).not.toHaveBeenCalled();
    expect(r.outcome).toBe("completed");
    expect(r.succeeded).toBe(2);
    expect(r.purged).toBe(0);
  });

  it("blocks a second manual retry on the SAME job while one is in flight", async () => {
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

  it("does NOT block a manual retry on a DIFFERENT job", async () => {
    let resolveA: ((v: unknown) => void) | null = null;
    mockRetryJob
      .mockImplementationOnce(() => new Promise((res) => { resolveA = res; }))
      .mockResolvedValueOnce({ succeeded: 1, failed: 0 });

    const a = triggerRetry("manual_job", "job-A");
    await Promise.resolve();
    await Promise.resolve();

    const b = await triggerRetry("manual_job", "job-B");
    expect(b.outcome).toBe("completed");
    expect(mockRetryJob).toHaveBeenNthCalledWith(2, "job-B");

    resolveA!({ succeeded: 0, failed: 0 });
    await a;
  });

  it("manual-job retry is NOT blocked by background cooldown", async () => {
    // Trigger a global pass to arm the cooldown.
    const g = await triggerRetry("online");
    expect(g.outcome).toBe("completed");

    // Immediately after, a per-job retry must still go through.
    mockRetryJob.mockResolvedValueOnce({ succeeded: 1, failed: 0 });
    const j = await triggerRetry("manual_job", "job-1");
    expect(j.outcome).toBe("completed");
    expect(mockRetryJob).toHaveBeenCalledWith("job-1");
  });

  it("manual-job retry IS blocked by an in-flight global retry (true conflict)", async () => {
    let resolveGlobal: ((v: unknown) => void) | null = null;
    mockRetryAll.mockImplementationOnce(
      () => new Promise((res) => { resolveGlobal = res; }),
    );

    const g = triggerRetry("manual_all");
    await Promise.resolve();
    await Promise.resolve();

    const j = await triggerRetry("manual_job", "job-1");
    expect(j.outcome).toBe("skipped_inflight");

    resolveGlobal!({ succeeded: 0, failed: 0, purged: 0 });
    await g;
  });
});
