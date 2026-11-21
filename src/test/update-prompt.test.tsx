// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const updateServiceWorker = vi.fn();
let needRefreshValue = true;
const setNeedRefresh = vi.fn((v: boolean) => {
  needRefreshValue = v;
});

// The virtual module is aliased to a stub in vitest.config; mock it here to
// simulate "a new version is waiting".
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefreshValue, setNeedRefresh] as const,
    offlineReady: [false, vi.fn()] as const,
    updateServiceWorker,
  }),
}));

let pending: { status: string }[] = [];
vi.mock("@/lib/pendingUploads", () => ({ getAllPendingUploads: async () => pending }));

import { UpdatePrompt } from "@/components/UpdatePrompt";
import { isUpdateHeldOn } from "@/lib/updatePolicy";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UpdatePrompt />
    </MemoryRouter>,
  );
}

describe("UpdatePrompt", () => {
  it("offers the waiting update with explicit Update / Later actions", async () => {
    pending = [];
    needRefreshValue = true;
    renderAt("/jobs");
    expect(screen.getByText("Update available")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
    cleanup();

    needRefreshValue = true;
    renderAt("/jobs");
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
  });

  it("never interrupts an active inspection", () => {
    needRefreshValue = true;
    renderAt("/inspection/job-1/pickup");
    expect(screen.queryByText("Update available")).toBeNull();
  });

  it("renders nothing when no update is waiting", () => {
    needRefreshValue = false;
    renderAt("/jobs");
    expect(screen.queryByText("Update available")).toBeNull();
  });

  it("holds the update on screens with unsaved form state", () => {
    for (const path of ["/jobs/new", "/jobs/abc/edit", "/expenses/new", "/expenses/e1/edit", "/invoice/new", "/inspection/j/pickup"]) {
      expect(isUpdateHeldOn(path)).toBe(true);
    }
    for (const path of ["/", "/jobs", "/jobs/abc", "/control/jobs"]) {
      expect(isUpdateHeldOn(path)).toBe(false);
    }
    needRefreshValue = true;
    renderAt("/jobs/new");
    expect(screen.queryByText("Update available")).toBeNull();
  });

  it("does not reload while an upload is in progress, and says why", async () => {
    updateServiceWorker.mockClear();
    pending = [{ status: "pending" }, { status: "uploading" }];
    needRefreshValue = true;
    renderAt("/jobs");
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByText(/upload is in progress/i)).toBeTruthy();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it("reserves scroll space while visible and releases it when gone", () => {
    needRefreshValue = true;
    const { unmount } = renderAt("/jobs");
    expect(document.documentElement.style.getPropertyValue("--update-prompt-space")).toMatch(/px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue("--update-prompt-space")).toBe("");
  });
});
