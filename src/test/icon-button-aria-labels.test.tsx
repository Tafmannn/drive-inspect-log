/**
 * A11Y-002: several shared icon-only buttons had no accessible name at all
 * — a screen reader announces only "button" with no indication of what it
 * does. Fixed three representative, reachable instances: the Control
 * Centre notification bell (rendered on every Control page via
 * ControlTopbar), the shared DetailPanel close button, and
 * ClientPickerCombobox's clear-selection button.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/features/attention/hooks/useAttentionData", () => ({
  useAttentionData: () => ({ data: { exceptions: [] }, isLoading: false }),
}));
vi.mock("@/hooks/useClients", () => ({ useClients: () => ({ data: [] }) }));

import { NotificationsPopover } from "@/features/control/components/NotificationsPopover";
import { DetailPanel } from "@/features/control/components/shared/DetailPanel";
import { ClientPickerCombobox } from "@/features/clients/components/ClientPickerCombobox";

describe("icon-only buttons have accessible names (A11Y-002)", () => {
  it("NotificationsPopover's bell button has an aria-label", () => {
    render(
      <MemoryRouter>
        <NotificationsPopover />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });

  it("DetailPanel's close button has an aria-label", () => {
    render(
      <DetailPanel open onClose={() => {}} title="Job">
        <p>content</p>
      </DetailPanel>,
    );
    expect(screen.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
  });

  it("ClientPickerCombobox's clear button has an aria-label", () => {
    render(<ClientPickerCombobox value="client-1" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Clear client selection" })).toBeInTheDocument();
  });
});
