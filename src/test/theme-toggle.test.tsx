// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ThemeProvider } from "next-themes";

import { ThemeToggle } from "@/components/ThemeToggle";

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  it("offers Light, Dark and follow-system options", () => {
    renderToggle();
    expect(screen.getByRole("radio", { name: /light/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /dark/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /auto/i })).toBeTruthy();
  });

  it("selecting Dark applies the dark class to <html> and persists", async () => {
    renderToggle();
    fireEvent.click(screen.getByRole("radio", { name: /dark/i }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("switching back to Light removes the dark class", async () => {
    renderToggle();
    fireEvent.click(screen.getByRole("radio", { name: /dark/i }));
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
    fireEvent.click(screen.getByRole("radio", { name: /light/i }));
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(false),
    );
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  // vi.useFakeTimers() and @testing-library's waitFor (which polls on REAL
  // timers) don't mix — waitFor would hang until its own timeout. Instead we
  // fireEvent (auto-wrapped in act) then explicitly flush pending effects
  // via act(async () => advanceTimersByTimeAsync(0)) before asserting.
  describe("Auto mode (time of day, not OS setting)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function flush(ms = 0) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it("applies light during daytime hours", async () => {
      vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0)); // noon
      renderToggle();
      fireEvent.click(screen.getByRole("radio", { name: /auto/i }));
      await flush();
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(window.localStorage.getItem("axentra-theme-mode")).toBe("auto");
    });

    it("applies dark during evening/night hours", async () => {
      vi.setSystemTime(new Date(2026, 0, 1, 22, 0, 0)); // 10pm
      renderToggle();
      fireEvent.click(screen.getByRole("radio", { name: /auto/i }));
      await flush();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("re-evaluates as time passes into the evening, without reselecting", async () => {
      vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0)); // noon
      renderToggle();
      fireEvent.click(screen.getByRole("radio", { name: /auto/i }));
      await flush();
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // Advance the clock into the evening and let the periodic re-check fire.
      vi.setSystemTime(new Date(2026, 0, 1, 21, 0, 0)); // 9pm
      await flush(5 * 60 * 1000);
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("does NOT just follow the OS prefers-color-scheme when in Auto", async () => {
      // Even if the OS says dark, Auto at noon must still resolve to light —
      // confirming this is clock-based, not next-themes' own "system" mode.
      const original = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q.includes("dark"),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }));
      try {
        vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0)); // noon
        renderToggle();
        fireEvent.click(screen.getByRole("radio", { name: /auto/i }));
        await flush();
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      } finally {
        window.matchMedia = original;
      }
    });
  });
});
