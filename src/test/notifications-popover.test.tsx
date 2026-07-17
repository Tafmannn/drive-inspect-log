// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPopover } from "@/features/control/components/NotificationsPopover";
import type { AttentionException } from "@/features/attention/types/exceptionTypes";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

let mockExceptions: AttentionException[] = [];
vi.mock("@/features/attention/hooks/useAttentionData", () => ({
  useAttentionData: () => ({ data: { exceptions: mockExceptions }, isLoading: false }),
}));

function makeException(id: string, route: string): AttentionException {
  return {
    id,
    severity: "medium",
    category: "compliance",
    title: `Title ${id}`,
    detail: `Detail ${id}`,
    createdAt: "2026-07-17T10:00:00Z",
    actionLabel: "Open driver",
    actionRoute: route,
  };
}

describe("NotificationsPopover", () => {
  beforeEach(() => {
    localStorage.clear();
    navigateMock.mockClear();
    mockExceptions = [
      makeException("ex-1", "/admin/drivers/user-1"),
      makeException("ex-2", "/jobs/job-9"),
    ];
  });

  it("navigates to the exception's own action route on click", async () => {
    render(
      <MemoryRouter>
        <NotificationsPopover />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByText("Title ex-1"));
    expect(navigateMock).toHaveBeenCalledWith("/admin/drivers/user-1");

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByText("Title ex-2"));
    expect(navigateMock).toHaveBeenCalledWith("/jobs/job-9");
  });

  it("clears the unread badge once the popover has been opened", async () => {
    render(
      <MemoryRouter>
        <NotificationsPopover />
      </MemoryRouter>
    );

    // Unseen: badge shows 2
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /2 unread/i })).toBeTruthy();

    // Open (view) → everything marked seen → badge gone
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await screen.findByText("Title ex-1");
    await waitFor(() => {
      expect(screen.queryByText("2")).toBeNull();
    });
    expect(screen.getByRole("button", { name: /2 active/i })).toBeTruthy();

    // Seen-state persists for this browser
    expect(JSON.parse(localStorage.getItem("axentra-notifications-seen-v1") ?? "[]").sort()).toEqual([
      "ex-1",
      "ex-2",
    ]);
  });

  it("badge reappears counting only newly fired exceptions", async () => {
    localStorage.setItem("axentra-notifications-seen-v1", JSON.stringify(["ex-1", "ex-2"]));
    mockExceptions = [
      makeException("ex-1", "/a"),
      makeException("ex-2", "/b"),
      makeException("ex-3", "/c"),
    ];

    render(
      <MemoryRouter>
        <NotificationsPopover />
      </MemoryRouter>
    );

    // Only ex-3 is new
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /1 unread/i })).toBeTruthy();
  });
});
