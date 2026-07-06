import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PhotoUploadsStatusGroup } from "@/components/PhotoUploadsStatusGroup";
import type { JobUploadSummary } from "@/lib/pendingUploads";

function job(overrides: Partial<JobUploadSummary>): JobUploadSummary {
  return {
    jobId: "job-1",
    jobNumber: "AX-001",
    vehicleReg: null,
    pendingCount: 0,
    failedCount: 0,
    needsAttentionCount: 0,
    lastErrorAt: null,
    failedItems: [],
    ...overrides,
  };
}

describe("PhotoUploadsStatusGroup", () => {
  it("renders nothing when there are no jobs", () => {
    const { container } = render(<PhotoUploadsStatusGroup jobs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when jobs have no pending/failed/attention items", () => {
    const { container } = render(
      <PhotoUploadsStatusGroup jobs={[job({})]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders grouped counts for pending, will-retry and needs-attention", () => {
    const jobs = [
      job({ jobId: "a", pendingCount: 2 }),
      job({ jobId: "b", failedCount: 3, needsAttentionCount: 1 }),
    ];
    const { getByTestId, queryByTestId } = render(
      <PhotoUploadsStatusGroup jobs={jobs} />,
    );
    expect(getByTestId("photo-uploads-status-group")).toBeTruthy();
    expect(getByTestId("photo-uploads-status-pending").textContent).toContain("2");
    expect(getByTestId("photo-uploads-status-failed").textContent).toContain("2");
    expect(getByTestId("photo-uploads-status-needs-attention").textContent).toContain("1");
    expect(queryByTestId("photo-uploads-status-group")?.textContent).toContain("2 jobs");
  });

  it("omits a bucket entirely when its count is zero", () => {
    const jobs = [job({ pendingCount: 4 })];
    const { queryByTestId } = render(<PhotoUploadsStatusGroup jobs={jobs} />);
    expect(queryByTestId("photo-uploads-status-pending")).toBeTruthy();
    expect(queryByTestId("photo-uploads-status-failed")).toBeNull();
    expect(queryByTestId("photo-uploads-status-needs-attention")).toBeNull();
  });
});
