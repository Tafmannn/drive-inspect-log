// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { jobsResult, online } = vi.hoisted(() => ({
  jobsResult: { data: [] as unknown[], isLoading: false, isError: false, refetch: () => {} },
  online: { value: true },
}));

vi.mock("@/hooks/useJobs", () => ({
  useActiveJobs: () => jobsResult,
  useDashboardCounts: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => online.value }));
vi.mock("@/hooks/useDriverGate", () => ({
  useDriverGate: () => ({ isDriverOnly: true, driverProfileId: "d1", status: "active" }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, isAdmin: false, isSuperAdmin: false }),
}));
vi.mock("@/components/PushOptIn", () => ({ PushOptIn: () => null }));
vi.mock("@/components/DeviationPrompt", () => ({ DeviationPrompt: () => null }));

import { JobList } from "@/pages/JobList";

function renderList() {
  return render(
    <MemoryRouter>
      <JobList />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jobsResult.data = [];
  jobsResult.isError = false;
  online.value = true;
});
afterEach(() => cleanup());

describe("list screens are truthful when offline", () => {
  it("a failed fetch while offline says 'You're offline', not 'No jobs assigned'", () => {
    jobsResult.isError = true;
    online.value = false;
    renderList();
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.queryByText("No jobs assigned")).toBeNull();
  });

  it("a genuinely empty list while online still shows the normal empty state", () => {
    renderList();
    expect(screen.getByText("No jobs assigned")).toBeTruthy();
    expect(screen.queryByText("You're offline")).toBeNull();
  });

  it("an error while ONLINE keeps the normal empty state (not an offline claim)", () => {
    jobsResult.isError = true;
    online.value = true;
    renderList();
    expect(screen.getByText("No jobs assigned")).toBeTruthy();
    expect(screen.queryByText("You're offline")).toBeNull();
  });
});
