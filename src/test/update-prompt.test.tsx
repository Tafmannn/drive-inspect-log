// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

import { UpdatePrompt } from "@/components/UpdatePrompt";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UpdatePrompt />
    </MemoryRouter>,
  );
}

describe("UpdatePrompt", () => {
  it("offers the waiting update with explicit Update / Later actions", () => {
    needRefreshValue = true;
    renderAt("/jobs");
    expect(screen.getByText("Update available")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
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
});
