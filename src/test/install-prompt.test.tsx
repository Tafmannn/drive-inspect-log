// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { InstallPrompt, isStandalone } from "@/components/InstallPrompt";

function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

function mockMatchMedia(standaloneMatches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("display-mode: standalone") ? standaloneMatches : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia(false);
});
afterEach(() => cleanup());

describe("InstallPrompt", () => {
  it("shows iOS Add-to-Home-Screen steps in Safari on iPhone", () => {
    mockUserAgent(IOS_UA);
    render(<InstallPrompt />);
    expect(screen.getByText("Add Axentra to your Home Screen")).toBeTruthy();
    expect(screen.getByText("Add to Home Screen")).toBeTruthy();
  });

  it("is hidden when the app is already installed (standalone)", () => {
    mockUserAgent(IOS_UA);
    mockMatchMedia(true);
    expect(isStandalone()).toBe(true);
    render(<InstallPrompt />);
    expect(screen.queryByText("Add Axentra to your Home Screen")).toBeNull();
  });

  it("dismiss persists across renders", () => {
    mockUserAgent(IOS_UA);
    render(<InstallPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Add Axentra to your Home Screen")).toBeNull();
    cleanup();
    render(<InstallPrompt />);
    expect(screen.queryByText("Add Axentra to your Home Screen")).toBeNull();
    expect(localStorage.getItem("install-prompt-dismissed")).toBe("1");
  });

  it("stays quiet on platforms with neither iOS UI nor a native prompt", () => {
    mockUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0");
    render(<InstallPrompt />);
    expect(screen.queryByText("Add Axentra to your Home Screen")).toBeNull();
  });
});
