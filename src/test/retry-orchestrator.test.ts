// Tests for retryOrchestrator structured outcomes.
//
// These verify the manual-retry contract relied on by the Pending
// Uploads screen for honest user feedback:
//   - completed       → real run with succeeded/failed counts
//   - skipped_inflight → second call while first is still running
//   - skipped_backoff  → second call within the jitter floor
//   - failed          → underlying retryAllPending threw

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetry = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  retryAllPending: (...args: unknown[]) => mockRetry(...args),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));

import {
  triggerRetry,
  __resetRetryOrchestratorForTests,
} from "@/lib/retryOrchestrator";

beforeEach(() => {
  mockRetry.mockReset();
  mockRetry.mockResolvedValue({ succeeded: 0, failed: 0, purged: 0 });
  __resetRetryOrchestratorForTests();
});

describe("retryOrchestrator outcomes", () => {
  it("returns completed with counts on a successful run", async () => {
    mockRetry.mockResolvedValueOnce({ succeeded: 3, failed: 1, purged: 0 });
    const r = await triggerRetry("manual");
    expect(r.outcome).toBe("completed");
    expect(r.succeeded).toBe(3);
    expect(r.failed).toBe(1);
  });

  it("returns skipped_inflight when a run is already in flight", async () => {
    let resolveInner: ((v: unknown) => void) | null = null;
    mockRetry.mockImplementationOnce(
      () => new Promise((res) => { resolveInner = res; }),
    );

    const first = triggerRetry("manual");
    // Wait past jitter so the first call has actually entered retryAllPending.
    await new Promise((r) => setTimeout(r, 900));

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
    mockRetry.mockRejectedValueOnce(new Error("boom"));
    const r = await triggerRetry("manual");
    expect(r.outcome).toBe("failed");
    expect(r.error).toBe("boom");
  });
});
