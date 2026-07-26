// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

import {
  ListRowsSkeleton,
  KpiRowSkeleton,
  FormSkeleton,
  DetailSkeleton,
} from "@/components/skeletons";
import { AnimatedNumber } from "@/components/AnimatedNumber";

afterEach(() => cleanup());

describe("shared skeletons", () => {
  it("render the requested shape counts and stay hidden from assistive tech", () => {
    const { container: rows } = render(<ListRowsSkeleton rows={4} />);
    expect(rows.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(rows.firstElementChild?.childElementCount).toBe(4);

    const { container: kpis } = render(<KpiRowSkeleton items={3} />);
    expect(kpis.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(kpis.firstElementChild?.childElementCount).toBe(3);

    const { container: form } = render(<FormSkeleton fields={2} />);
    expect(form.firstElementChild?.getAttribute("aria-hidden")).toBe("true");

    const { container: detail } = render(<DetailSkeleton sections={2} />);
    expect(detail.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("contain no focusable elements", () => {
    const { container } = render(
      <>
        <ListRowsSkeleton />
        <KpiRowSkeleton />
        <FormSkeleton />
        <DetailSkeleton />
      </>,
    );
    expect(container.querySelectorAll("button, a, input, [tabindex]").length).toBe(0);
  });
});

describe("AnimatedNumber", () => {
  it("shows the value immediately on first render (no zero start)", () => {
    render(<AnimatedNumber value={42} />);
    // aria-label always carries the real final value for assistive tech.
    expect(screen.getByLabelText("42")).toBeTruthy();
    expect(screen.getByLabelText("42").textContent).toBe("42");
  });

  it("animates to the new value when it changes", async () => {
    const { rerender } = render(<AnimatedNumber value={0} />);
    rerender(<AnimatedNumber value={10} />);
    // Final accessible value is exposed immediately…
    expect(screen.getByLabelText("10")).toBeTruthy();
    // …and the visible number settles on 10.
    await waitFor(
      () => {
        expect(screen.getByLabelText("10").textContent).toBe("10");
      },
      { timeout: 3000 },
    );
  });

  it("handles decreasing values", async () => {
    const { rerender } = render(<AnimatedNumber value={10} />);
    rerender(<AnimatedNumber value={3} />);
    await waitFor(
      () => {
        expect(screen.getByLabelText("3").textContent).toBe("3");
      },
      { timeout: 3000 },
    );
  });

  it("skips animation when reduced motion is preferred", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));
    try {
      const { rerender } = render(<AnimatedNumber value={0} />);
      rerender(<AnimatedNumber value={99} />);
      // No frames needed — the value lands instantly.
      expect(screen.getByLabelText("99").textContent).toBe("99");
    } finally {
      window.matchMedia = original;
    }
  });

  it("unmounts mid-animation without erroring", () => {
    const { rerender, unmount } = render(<AnimatedNumber value={0} />);
    rerender(<AnimatedNumber value={1000} />);
    expect(() => unmount()).not.toThrow();
  });
});
