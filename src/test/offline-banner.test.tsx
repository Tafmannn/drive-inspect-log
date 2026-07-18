// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "@/components/OfflineBanner";

// jsdom reports navigator.onLine as a read-only getter; override it so we can
// drive the online/offline transitions the banner reacts to.
function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function fireConnectivity(event: "online" | "offline") {
  act(() => {
    window.dispatchEvent(new Event(event));
  });
}

describe("OfflineBanner", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => setOnline(true));

  it("renders nothing while online and never dropped", () => {
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline message when the connection drops", () => {
    render(<OfflineBanner />);
    setOnline(false);
    fireConnectivity("offline");
    expect(screen.getByText(/you're offline/i)).toBeTruthy();
  });

  it("shows a reconnected confirmation only after having been offline", () => {
    render(<OfflineBanner />);
    // Drop, then restore.
    setOnline(false);
    fireConnectivity("offline");
    setOnline(true);
    fireConnectivity("online");
    expect(screen.getByText(/back online/i)).toBeTruthy();
  });

  it("uses role=status so the change is announced to assistive tech", () => {
    render(<OfflineBanner />);
    setOnline(false);
    fireConnectivity("offline");
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
