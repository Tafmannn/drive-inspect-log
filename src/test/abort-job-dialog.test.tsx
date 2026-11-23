// @vitest-environment jsdom
/** Admin "Abort Collection" dialog: validation, the no-name exception, loading and error states. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const confirm = {
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
};
vi.mock("@/features/abort/hooks/useAbort", () => ({ useConfirmAbort: () => confirm }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toastSpy(...a) }));

import { AbortJobDialog } from "@/features/abort/components/AbortJobDialog";

const job = { id: "job-1", ref: "JOB-7", vehicleReg: "AB12 CDE", status: "assigned" };

function renderDialog(onOpenChange = vi.fn()) {
  render(<AbortJobDialog open onOpenChange={onOpenChange} job={job} />);
  return onOpenChange;
}

describe("AbortJobDialog", () => {
  beforeEach(() => {
    confirm.mutateAsync = vi.fn().mockResolvedValue({
      abortId: "a1", confirmedAt: "2026-11-23T14:05:00Z", alreadyAborted: false,
    });
    confirm.isPending = false;
    confirm.isError = false;
    confirm.error = null;
    toastSpy.mockReset();
  });

  it("shows the job context, one name field, the exception and the automatic timestamp note", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Abort Collection" })).toBeTruthy();
    expect(screen.getByText("JOB-7")).toBeTruthy();
    expect(screen.getByText("AB12 CDE")).toBeTruthy();
    expect(screen.getByLabelText("Name of person confirming Abort")).toBeTruthy();
    expect(screen.getByText("Authorise without contact name (admin only)")).toBeTruthy();
    expect(screen.getByText(/recorded automatically/)).toBeTruthy();
  });

  it("refuses an empty or whitespace-only name without calling the server", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name of person confirming Abort"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Abort" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(confirm.mutateAsync).not.toHaveBeenCalled();
  });

  it("sends the trimmed name and the status the admin was looking at", async () => {
    const onOpenChange = renderDialog();
    fireEvent.change(screen.getByLabelText("Name of person confirming Abort"), { target: { value: "  Jane   Smith " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Abort" }));
    await waitFor(() => expect(confirm.mutateAsync).toHaveBeenCalledTimes(1));
    expect(confirm.mutateAsync).toHaveBeenCalledWith({
      jobId: "job-1", expectedStatus: "assigned", contactName: "Jane Smith", noNameException: false,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSpy.mock.calls[0][0].description).toMatch(/23 Nov 2026, 14:05 GMT/);
  });

  it("allows the explicit no-name exception", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Abort" }));
    await waitFor(() => expect(confirm.mutateAsync).toHaveBeenCalledTimes(1));
    expect(confirm.mutateAsync.mock.calls[0][0]).toMatchObject({ contactName: null, noNameException: true });
  });

  it("stays open and says nothing was aborted when the server refuses", async () => {
    confirm.mutateAsync = vi.fn().mockRejectedValue(new Error("STALE_JOB_STATE"));
    confirm.isError = true;
    confirm.error = new Error("STALE_JOB_STATE");
    const onOpenChange = renderDialog();
    fireEvent.change(screen.getByLabelText("Name of person confirming Abort"), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Abort" }));
    await waitFor(() => expect(confirm.mutateAsync).toHaveBeenCalled());
    expect(screen.getByText(/has not been aborted/)).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows a loading state and blocks a second submit while confirming", () => {
    confirm.isPending = true;
    renderDialog();
    const btn = screen.getByRole("button", { name: "Confirming…" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("reports an Abort another admin already confirmed instead of a second one", async () => {
    confirm.mutateAsync = vi.fn().mockResolvedValue({ abortId: "a1", confirmedAt: "2026-07-01T09:00:00Z", alreadyAborted: true });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Name of person confirming Abort"), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Abort" }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls[0][0].title).toBe("Already aborted");
    expect(toastSpy.mock.calls[0][0].description).toMatch(/10:00 BST/);
  });
});
