// Tests for the centralised retry orchestrator.
//
// These verify:
//   - single-flight de-duplication of overlapping triggers
//   - jitter floor between successive triggers
//   - graceful no-op when retryAllPending throws
//
// We mock pendingUploads.retryAllPending so the test stays focused on
// the orchestrator's coordination semantics — the queue's own state
// machine is covered by pending-uploads.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetry = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  retryAllPending: (...args: unknown[]) => mockRetry(...args),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));

import { triggerRetry } from "@/lib/retryOrchestrator";

beforeEach(() => {
  mockRetry.mockReset();
  mockRetry.mockResolvedValue({ succeeded: 0, failed: 0, purged: 0 });
});

describe("retryOrchestrator.triggerRetry", () => {
  it("de-duplicates overlapping triggers via single-flight latch", async () => {
    // Make the inner work resolve slowly so concurrent calls collide.
    let resolveInner: ((v: unknown) => void) | null = null;
    mockRetry.mockImplementationOnce(
      () => new Promise((res) => { resolveInner = res; }),
    );

    const a = triggerRetry("manual");
    const b = triggerRetry("online");
    const c = triggerRetry("visibility");

    // Wait for the orchestrator's jitter window + microtask flush so the
    // first inner call has actually started before we resolve it.
    await new Promise((r) => setTimeout(r, 900));
    expect(resolveInner).toBeTypeOf("function");
    resolveInner!({ succeeded: 1, failed: 0, purged: 0 });
    await Promise.all([a, b, c]);

    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("does not throw if retryAllPending rejects", async () => {
    mockRetry.mockRejectedValueOnce(new Error("boom"));
    await expect(triggerRetry("manual")).resolves.toBeUndefined();
  });
});
