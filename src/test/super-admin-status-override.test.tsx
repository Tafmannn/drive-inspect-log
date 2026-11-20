/**
 * The super-admin override panel: who sees it, when the button is enabled, what it
 * asks before it acts, and what it says when the database refuses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const h = vi.hoisted(() => ({
  isSuperAdmin: true,
  mutateAsync: vi.fn(),
  isPending: false,
  toast: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isSuperAdmin: h.isSuperAdmin }) }));
vi.mock("@/hooks/useJobs", () => ({
  useSuperAdminOverrideStatus: () => ({ mutateAsync: h.mutateAsync, isPending: h.isPending }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (a: unknown) => h.toast(a) }));

// Radix Select is awkward in jsdom; a native select exercises the same props.
type SelectProps = { value: string; onValueChange: (v: string) => void; children: React.ReactNode };
type ItemProps = { value: string; children: React.ReactNode };
type ChildrenProps = { children: React.ReactNode };
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: SelectProps) => (
    <select aria-label="New status" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Choose…</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: ChildrenProps) => <>{children}</>,
  SelectItem: ({ value, children }: ItemProps) => <option value={value}>{children}</option>,
}));

import { SuperAdminStatusOverride } from "@/features/jobs/components/SuperAdminStatusOverride";

const open = () => render(<SuperAdminStatusOverride jobId="job-1" jobStatus="completed" />);
const button = () => screen.getByRole("button", { name: "Change status" });

describe("SuperAdminStatusOverride", () => {
  beforeEach(() => {
    h.isSuperAdmin = true;
    h.isPending = false;
    h.mutateAsync.mockReset();
    h.toast.mockReset();
  });

  it("is not shown to anyone but a super admin", () => {
    h.isSuperAdmin = false;
    const { container } = open();
    expect(container).toBeEmptyDOMElement();
  });

  it("starts disabled, and offers every status except the current one", () => {
    open();
    expect(button()).toBeDisabled();
    const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(options).toContain("ready_for_pickup");
    expect(options).not.toContain("completed");
    expect(options).toHaveLength(15);
  });

  it("needs a status AND a long-enough reason before it can be used", () => {
    open();
    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "ready_for_pickup" } });
    expect(button()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "no" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 5/);
    expect(button()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Test invoice" } });
    expect(button()).toBeEnabled();
  });

  it("explains the consequences of the chosen status", () => {
    open();
    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "ready_for_pickup" } });
    expect(screen.getByTestId("override-warnings")).toHaveTextContent(/completion date is cleared/i);
  });

  it("asks to confirm, then changes the status with the reason", async () => {
    h.mutateAsync.mockResolvedValue({ fromStatus: "completed", toStatus: "ready_for_pickup", removedNotifications: 0 });
    open();
    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "ready_for_pickup" } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Test invoice" } });
    fireEvent.click(button());

    expect(h.mutateAsync).not.toHaveBeenCalled(); // nothing happens until confirmed
    expect(await screen.findByText(/Change status to Ready For Pickup\?/)).toBeInTheDocument();

    const confirm = screen.getAllByRole("button", { name: "Change status" }).pop()!;
    fireEvent.click(confirm);

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith({
      jobId: "job-1", newStatus: "ready_for_pickup", reason: "Test invoice",
    }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Status changed to Ready For Pickup" }));
    // the form resets
    await waitFor(() => expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe(""));
  });

  it("shows the database's refusal and keeps what was typed", async () => {
    h.mutateAsync.mockRejectedValue(new Error("This job is on an invoice. Cancel the invoice first, then change the status."));
    open();
    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "assigned" } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Test invoice" } });
    fireEvent.click(button());
    fireEvent.click(screen.getAllByRole("button", { name: "Change status" }).pop()!);

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Status change failed",
      description: expect.stringMatching(/Cancel the invoice first/),
      variant: "destructive",
    })));
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe("Test invoice");
  });
});
