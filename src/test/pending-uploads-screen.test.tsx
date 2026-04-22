// Screen-level regression tests for the Pending Uploads page.
//
// These render the actual page component and assert real user-visible
// behaviour:
//   - badges appear when the queue has pending/failed items
//   - badges disappear when the queue is empty
//   - Retry All produces the right toast for each RetryResult outcome
//
// We mock the data layer (queue helpers) and the orchestrator so the
// screen behaviour is the unit under test, not the queue internals.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGetByJob = vi.fn();
const mockPruneDone = vi.fn();
const mockTriggerRetry = vi.fn();
const mockToast = vi.fn();

vi.mock("@/lib/pendingUploads", () => ({
  getPendingUploadsByJob: (...a: unknown[]) => mockGetByJob(...a),
  pruneDone: (...a: unknown[]) => mockPruneDone(...a),
}));
vi.mock("@/lib/retryOrchestrator", () => ({
  triggerRetry: (...a: unknown[]) => mockTriggerRetry(...a),
}));
vi.mock("@/hooks/use-toast", () => ({
  toast: (...a: unknown[]) => mockToast(...a),
}));
vi.mock("@/components/AppHeader", () => ({
  AppHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));
vi.mock("@/components/DashboardSkeleton", () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
}));

import { PendingUploads } from "@/pages/PendingUploads";
import { __resetEvidenceQueueBusForTests } from "@/lib/evidenceQueueBus";

const ONE_JOB = [
  {
    jobId: "job-1",
    jobNumber: "AX-001",
    vehicleReg: "AB12 CDE",
    pendingCount: 2,
    failedCount: 1,
    lastErrorAt: null,
  },
];

beforeEach(() => {
  mockGetByJob.mockReset();
  mockPruneDone.mockReset().mockResolvedValue(undefined);
  mockTriggerRetry.mockReset();
  mockToast.mockReset();
  __resetEvidenceQueueBusForTests();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <PendingUploads />
    </MemoryRouter>,
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PendingUploads screen — evidence visibility", () => {
  it("renders evidence badges when the queue has items", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    const { container } = renderScreen();
    await flush();
    const badges = container.querySelectorAll(
      "[data-testid='evidence-status-badges']",
    );
    // At least one badge surface (per-job row) should render.
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain("AX-001");
    expect(container.textContent).toContain("uploads remaining");
  });

  it("renders the empty state and no badges when the queue is empty", async () => {
    mockGetByJob.mockResolvedValue([]);
    const { container } = renderScreen();
    await flush();
    expect(
      container.querySelector("[data-testid='evidence-status-badges']"),
    ).toBeNull();
    expect(container.textContent).toContain("All photos are synced");
  });
});

describe("PendingUploads screen — Retry All messaging", () => {
  it("shows success toast with counts when outcome=completed (succeeded only)", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    mockTriggerRetry.mockResolvedValueOnce({
      outcome: "completed",
      succeeded: 3,
      failed: 0,
      purged: 0,
    });
    const { getByTestId } = renderScreen();
    await flush();
    await act(async () => { fireEvent.click(getByTestId("retry-all-btn")); });
    await flush();

    expect(mockTriggerRetry).toHaveBeenCalledWith("manual");
    expect(mockToast).toHaveBeenCalled();
    const title = (mockToast.mock.calls.at(-1)?.[0] as { title: string }).title;
    expect(title).toContain("3 uploaded");
  });

  it("shows destructive toast when outcome=completed with failures", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    mockTriggerRetry.mockResolvedValueOnce({
      outcome: "completed",
      succeeded: 1,
      failed: 2,
      purged: 0,
    });
    const { getByTestId } = renderScreen();
    await flush();
    await act(async () => { fireEvent.click(getByTestId("retry-all-btn")); });
    await flush();
    const arg = mockToast.mock.calls.at(-1)?.[0] as {
      title: string; variant?: string;
    };
    expect(arg.title).toContain("1 uploaded");
    expect(arg.title).toContain("2 still failing");
    expect(arg.variant).toBe("destructive");
  });

  it("shows 'already running' toast when outcome=skipped_inflight (no false success)", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    mockTriggerRetry.mockResolvedValueOnce({
      outcome: "skipped_inflight",
      succeeded: 0,
      failed: 0,
      purged: 0,
    });
    const { getByTestId } = renderScreen();
    await flush();
    await act(async () => { fireEvent.click(getByTestId("retry-all-btn")); });
    await flush();
    const title = (mockToast.mock.calls.at(-1)?.[0] as { title: string }).title;
    expect(title).toMatch(/already running/i);
  });

  it("shows 'please wait Xs' toast when outcome=skipped_backoff (no false success)", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    mockTriggerRetry.mockResolvedValueOnce({
      outcome: "skipped_backoff",
      succeeded: 0,
      failed: 0,
      purged: 0,
      retryAfterMs: 2500,
    });
    const { getByTestId } = renderScreen();
    await flush();
    await act(async () => { fireEvent.click(getByTestId("retry-all-btn")); });
    await flush();
    const title = (mockToast.mock.calls.at(-1)?.[0] as { title: string }).title;
    expect(title).toMatch(/wait .*s/i);
  });

  it("shows destructive toast when outcome=failed (no false success)", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    mockTriggerRetry.mockResolvedValueOnce({
      outcome: "failed",
      succeeded: 0,
      failed: 0,
      purged: 0,
      error: "boom",
    });
    const { getByTestId } = renderScreen();
    await flush();
    await act(async () => { fireEvent.click(getByTestId("retry-all-btn")); });
    await flush();
    const arg = mockToast.mock.calls.at(-1)?.[0] as {
      title: string; variant?: string;
    };
    expect(arg.variant).toBe("destructive");
    expect(arg.title).toMatch(/could not start/i);
  });
});

describe("PendingUploads screen — per-job Retry routing", () => {
  it("routes per-job retry through the orchestrator with the jobId", async () => {
    mockGetByJob.mockResolvedValue(ONE_JOB);
    mockTriggerRetry.mockResolvedValueOnce({
      outcome: "completed",
      succeeded: 1,
      failed: 0,
      purged: 0,
    });
    const { getByTestId } = renderScreen();
    await flush();
    await act(async () => {
      fireEvent.click(getByTestId("retry-job-job-1"));
    });
    await flush();
    expect(mockTriggerRetry).toHaveBeenCalledWith("manual_job", "job-1");
  });
});
