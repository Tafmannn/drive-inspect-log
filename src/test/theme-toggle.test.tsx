// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
});
