// Tests for EvidenceStatusBadges integration.
//
// The component is a thin reader on top of `getPendingUploadsByJob` —
// the production-meaningful contract is:
//   - it queries the queue
//   - it sums per-job and global counts correctly
//   - it re-reads when refreshKey changes
//
// We test that contract directly via the underlying queue helper
// (mocked) and through a React render without leaning on
// @testing-library/dom (which is not installed in this environment).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";

const mockGetByJob = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  getPendingUploadsByJob: (...args: unknown[]) => mockGetByJob(...args),
}));

import { EvidenceStatusBadges } from "@/components/EvidenceStatusBadges";

beforeEach(() => {
  mockGetByJob.mockReset();
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

  it("re-reads the queue when refreshKey changes", async () => {
    mockGetByJob.mockResolvedValue([]);
    const { rerender } = render(<EvidenceStatusBadges refreshKey={0} />);
    await flushAsync();
    const initialCalls = mockGetByJob.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    rerender(<EvidenceStatusBadges refreshKey={1} />);
    await flushAsync();
    expect(mockGetByJob.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
