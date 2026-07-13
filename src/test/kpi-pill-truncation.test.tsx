/**
 * UI-004: AdminDashboard's and SuperAdminDashboard's KpiPill label span
 * combined Tailwind's `truncate` (overflow:hidden + text-overflow:ellipsis +
 * white-space:nowrap) with `flex items-center justify-center` on the SAME
 * element as the trailing chevron icon. Browsers do not apply
 * text-overflow:ellipsis reliably to a flex container with multiple
 * children — verified live at 320px viewport width (Playwright screenshot):
 * long labels like "Unassigned" rendered as a garbled, symmetrically
 * clipped "IASSIGNE" instead of a readable "Unassi…" — because the
 * centered flex line overflowed and both edges were hidden equally, rather
 * than producing a leading-text + trailing-ellipsis truncation.
 *
 * The fix separates concerns: the truncated text lives in its own
 * `min-w-0 truncate` span (a plain, non-flex block that can now truncate
 * correctly), while a sibling wrapping span handles the flex layout with
 * the icon. This locks that structural fix in place.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Truck } from "lucide-react";
import { KpiPill as AdminKpiPill } from "@/pages/AdminDashboard";
import { KpiPill as SuperAdminKpiPill } from "@/pages/SuperAdminDashboard";

function assertNoTruncateFlexCombo(container: HTMLElement, labelText: string) {
  const labelEl = Array.from(container.querySelectorAll("span")).find(
    (el) => el.textContent?.trim() === labelText && el.className.includes("truncate"),
  );
  expect(labelEl, `expected a span with class "truncate" containing "${labelText}"`).toBeTruthy();
  // The truncated element itself must not also be a flex container — that
  // combination is what produced the garbled, symmetric clipping.
  expect(labelEl!.className).not.toMatch(/\bflex\b/);
  expect(labelEl!.className).toMatch(/\bmin-w-0\b/);
}

describe("KpiPill label truncation structure (UI-004)", () => {
  it("AdminDashboard's KpiPill keeps truncate off the flex container", () => {
    const { container } = render(
      <AdminKpiPill label="Unassigned" value={3} icon={Truck} onClick={() => {}} />,
    );
    assertNoTruncateFlexCombo(container, "Unassigned");
  });

  it("SuperAdminDashboard's KpiPill keeps truncate off the flex container", () => {
    const { container } = render(
      <SuperAdminKpiPill label="Organisations" value={5} icon={Truck} onClick={() => {}} />,
    );
    assertNoTruncateFlexCombo(container, "Organisations");
  });
});
