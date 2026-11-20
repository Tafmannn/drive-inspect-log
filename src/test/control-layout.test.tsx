/**
 * The Command Center shell: sized to the visible screen, one scroller, and a menu drawer
 * on phones. These are the layout fixes for iPhone rotation and scrolling.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@/features/control/components/ControlSidebar", () => ({
  ControlSidebar: () => <nav data-testid="sidebar">Sidebar</nav>,
}));
vi.mock("@/features/control/components/ControlTopbar", () => ({
  ControlTopbar: ({ leading }: { leading?: ReactNode }) => <header data-testid="topbar">{leading}</header>,
}));

import { ControlLayout } from "@/features/control/layouts/ControlLayout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/control/page"]}>
      <Routes>
        <Route path="/control" element={<ControlLayout />}>
          <Route path="page" element={<p>The page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ControlLayout", () => {
  it("shows the topbar, a sidebar and the routed page", () => {
    renderLayout();
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("The page content")).toBeInTheDocument();
  });

  it("fills the visible screen (dvh), not the toolbar-collapsed 100vh that overflowed on iOS", () => {
    const { container } = renderLayout();
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain("h-dvh");
    expect(shell.className).not.toContain("h-screen");
    expect(shell.className).toContain("overflow-hidden"); // the document itself never scrolls
  });

  it("scrolls in one place: <main> is the scroll root and keeps the bounce inside itself", () => {
    renderLayout();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("data-scroll-root"); // ScrollToTop resets and restores this element
    expect(main.className).toContain("overflow-y-auto");
    expect(main.className).toContain("overscroll-contain");
    expect(within(main).getByText("The page content")).toBeInTheDocument();
  });

  it("has a menu button for phones, and the drawer is closed to begin with", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(screen.getAllByTestId("sidebar")).toHaveLength(1); // only the desktop sidebar
  });

  it("the menu button opens the drawer, which clears the notch and home indicator", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getAllByTestId("sidebar")).toHaveLength(2); // desktop + the one in the drawer
    const drawerSidebar = screen.getAllByTestId("sidebar")[1];
    const drawerWrapper = drawerSidebar.parentElement as HTMLElement;
    expect(drawerWrapper.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(drawerWrapper.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(drawerWrapper.className).toContain("pl-[env(safe-area-inset-left)]");
  });

  it("choosing something in the drawer closes it", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getAllByTestId("sidebar")).toHaveLength(2);

    fireEvent.click(screen.getAllByTestId("sidebar")[1]);

    expect(screen.getAllByTestId("sidebar")).toHaveLength(1);
  });
});
