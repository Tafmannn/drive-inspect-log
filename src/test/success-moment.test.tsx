// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";

const hapticSuccess = vi.fn();
vi.mock("@/lib/haptics", () => ({
  hapticSuccess: () => hapticSuccess(),
  hapticError: vi.fn(),
  hapticTick: vi.fn(),
}));

import { SuccessMoment } from "@/components/SuccessMoment";

beforeEach(() => {
  vi.useFakeTimers();
  hapticSuccess.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SuccessMoment", () => {
  it("renders each variant with truthful wording", () => {
    render(<SuccessMoment variant="completed" onDone={() => {}} />);
    expect(screen.getByText("Inspection completed")).toBeTruthy();
    cleanup();

    render(<SuccessMoment variant="delivery-completed" onDone={() => {}} />);
    expect(screen.getByText("Delivery completed")).toBeTruthy();
    cleanup();

    render(<SuccessMoment variant="saved-offline" onDone={() => {}} />);
    // The offline save must never claim the inspection was "submitted".
    expect(screen.getByText("Saved on this device")).toBeTruthy();
    expect(screen.queryByText(/has been submitted/i)).toBeNull();
    expect(
      screen.getByText(/will submit automatically when you're back online/i),
    ).toBeTruthy();
  });

  it("calls onDone exactly once after the hold, with one haptic", () => {
    const onDone = vi.fn();
    render(<SuccessMoment variant="completed" onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it("cleans up on unmount — no stale onDone after navigation elsewhere", () => {
    const onDone = vi.fn();
    const { unmount } = render(
      <SuccessMoment variant="saved-offline" onDone={onDone} />,
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("announces politely to assistive technology", () => {
    render(<SuccessMoment variant="completed" onDone={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
