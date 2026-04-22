// Tests for EvidenceStatusBadges integration.
//
// Proves:
//   - renders nothing when the queue is empty
//   - renders pending + failed counts for a specific jobId
//   - renders aggregated totals when no jobId is provided
//   - re-reads the queue when refreshKey changes (no extra polling needed)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockGetByJob = vi.fn();
vi.mock("@/lib/pendingUploads", () => ({
  getPendingUploadsByJob: (...args: unknown[]) => mockGetByJob(...args),
}));

import { EvidenceStatusBadges } from "@/components/EvidenceStatusBadges";

beforeEach(() => {
  mockGetByJob.mockReset();
});

describe("EvidenceStatusBadges", () => {
  it("renders nothing when queue is empty", async () => {
    mockGetByJob.mockResolvedValue([]);
    const { container } = render(<EvidenceStatusBadges />);
    await waitFor(() => expect(mockGetByJob).toHaveBeenCalled());
    // Component returns null when there are no counts.
    expect(container.querySelector("[data-testid='evidence-status-badges']"))
      .toBeNull();
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
    render(<EvidenceStatusBadges jobId="job-1" />);
    await screen.findByText("2 uploading");
    await screen.findByText("1 failed");
  });

  it("aggregates totals across jobs when no jobId given", async () => {
    mockGetByJob.mockResolvedValue([
      { jobId: "j1", jobNumber: null, vehicleReg: null, pendingCount: 1, failedCount: 0, lastErrorAt: null },
      { jobId: "j2", jobNumber: null, vehicleReg: null, pendingCount: 2, failedCount: 3, lastErrorAt: null },
    ]);
    render(<EvidenceStatusBadges />);
    await screen.findByText("3 uploading");
    await screen.findByText("3 failed");
  });

  it("re-reads the queue when refreshKey changes", async () => {
    mockGetByJob.mockResolvedValue([]);
    const { rerender } = render(<EvidenceStatusBadges refreshKey={0} />);
    await waitFor(() => expect(mockGetByJob).toHaveBeenCalledTimes(1));
    rerender(<EvidenceStatusBadges refreshKey={1} />);
    await waitFor(() => expect(mockGetByJob).toHaveBeenCalledTimes(2));
  });
});
