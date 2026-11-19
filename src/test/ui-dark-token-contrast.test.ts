/**
 * Dark-theme token contrast contract (Phase 1a follow-up).
 * Reads the real `.dark` block from src/index.css, so a token edit that breaks
 * a pair fails here instead of only showing up in a manual contrast audit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const darkBlock = css.slice(css.search(/\n\s*\.dark\s*\{/));
const body = darkBlock.slice(darkBlock.indexOf("{") + 1, darkBlock.indexOf("\n  }"));

function token(name: string): [number, number, number] {
  const m = body.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!m) throw new Error(`dark token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function rgb([h, s, l]: [number, number, number]): [number, number, number] {
  const S = s / 100, L = l / 100, a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
function lum(c: [number, number, number]) {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string) {
  const [hi, lo] = [lum(rgb(token(a))), lum(rgb(token(b)))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("dark theme token contrast", () => {
  it("active sidebar label is readable on the active item and the sidebar (>= 4.5:1)", () => {
    expect(ratio("sidebar-primary", "sidebar-accent")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("sidebar-primary", "sidebar-background")).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders reach 3:1 against the page background (WCAG 1.4.11)", () => {
    expect(ratio("input", "background")).toBeGreaterThanOrEqual(3);
    expect(ratio("border-strong", "background")).toBeGreaterThanOrEqual(3);
  });

  it("destructive works as text on the page and as a button background (>= 4.5:1)", () => {
    expect(ratio("destructive", "background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("destructive", "destructive-foreground")).toBeGreaterThanOrEqual(4.5);
  });

  it("body, muted and primary text keep at least 4.5:1", () => {
    expect(ratio("foreground", "background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("muted-foreground", "background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("primary", "background")).toBeGreaterThanOrEqual(4.5);
  });
});
