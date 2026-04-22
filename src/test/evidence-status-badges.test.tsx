// Tests for EvidenceStatusBadges integration.
//
// The component is a thin reader on top of `getPendingUploadsByJob`,
// re-driven by the shared evidenceQueueBus. The production-meaningful
// contract is:
//   - it queries the queue
//   - it sums per-job and global counts correctly
//   - it re-reads when a queue mutation is broadcast on the shared bus

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

const mockGetByJob = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  getPendingUploadsByJob: (...args: unknown[]) => mockGetByJob(...args),
}));

import { EvidenceStatusBadges } from "@/components/EvidenceStatusBadges";
import {
  notifyEvidenceQueueChanged,
  __resetEvidenceQueueBusForTests,
} from "@/lib/evidenceQueueBus";

beforeEach(() => {
  mockGetByJob.mockReset();
  __resetEvidenceQueueBusForTests();
});

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("EvidenceStatusBadges", () => {
  it("renders nothing when queue is empty", async () => {
    mockGetByJob.mockResolvedValue([]);
    const { container } = render(<EvidenceStatusBadges />);
    await flushAsync();
    expect(
      container.querySelector("[data-testid='evidence-status-badges']"),
    ).toBeNull();
  });

  it("shows pending and failed counts for a specific job", async () => {
    mockGetByJob.mockResolvedValue([
      {
        jobId: "job-1",
        jobNumber: "AX1",
        vehicleReg: "AB12 CDE",
        pendingCount: 2,
        failedCount: 1,
        lastErrorAt: null,
      },
    ]);
    const { container } = render(<EvidenceStatusBadges jobId="job-1" />);
    await flushAsync();
    const root = container.querySelector(
      "[data-testid='evidence-status-badges']",
    );
    expect(root).not.toBeNull();
    expect(root!.textContent).toContain("2 uploading");
    expect(root!.textContent).toContain("1 failed");
  });

  it("aggregates totals across jobs when no jobId given", async () => {
    mockGetByJob.mockResolvedValue([
      { jobId: "j1", jobNumber: null, vehicleReg: null, pendingCount: 1, failedCount: 0, lastErrorAt: null },
      { jobId: "j2", jobNumber: null, vehicleReg: null, pendingCount: 2, failedCount: 3, lastErrorAt: null },
    ]);
    const { container } = render(<EvidenceStatusBadges />);
    await flushAsync();
    const root = container.querySelector(
      "[data-testid='evidence-status-badges']",
    );
    expect(root).not.toBeNull();
    expect(root!.textContent).toContain("3 uploading");
    expect(root!.textContent).toContain("3 failed");
  });

  it("re-reads the queue when the shared evidence-queue bus broadcasts a change", async () => {
    mockGetByJob.mockResolvedValue([]);
    render(<EvidenceStatusBadges />);
    await flushAsync();
    const initialCalls = mockGetByJob.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    await act(async () => {
      notifyEvidenceQueueChanged();
      await Promise.resolve();
    });
    await flushAsync();
    expect(mockGetByJob.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
