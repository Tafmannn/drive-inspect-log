// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PodEmailConfirmDialog } from "@/components/PodEmailConfirmDialog";

describe("PodEmailConfirmDialog", () => {
  it("pre-fills the job's contact email but keeps Send disabled until confirmed", () => {
    const onConfirm = vi.fn();
    render(
      <PodEmailConfirmDialog
        open
        onOpenChange={() => {}}
        defaultEmail="onfile@example.com"
        documentLabel="Job AX0063's POD"
        sending={false}
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByLabelText(/recipient email/i) as HTMLInputElement;
    expect(input.value).toBe("onfile@example.com");
    // A pre-filled valid address should already enable Send.
    expect(screen.getByRole("button", { name: /send email/i })).not.toBeDisabled();
  });

  it("lets the admin amend the address and sends the edited value, not the original", () => {
    const onConfirm = vi.fn();
    render(
      <PodEmailConfirmDialog
        open
        onOpenChange={() => {}}
        defaultEmail="wrong@example.com"
        documentLabel="Job AX0063's POD"
        sending={false}
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByLabelText(/recipient email/i);
    fireEvent.change(input, { target: { value: "corrected@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));

    expect(onConfirm).toHaveBeenCalledWith("corrected@example.com");
  });

  it("disables Send for an invalid or empty address", () => {
    render(
      <PodEmailConfirmDialog
        open
        onOpenChange={() => {}}
        defaultEmail=""
        documentLabel="Job AX0063's POD"
        sending={false}
        onConfirm={vi.fn()}
      />
    );

    const sendButton = screen.getByRole("button", { name: /send email/i });
    expect(sendButton).toBeDisabled();

    const input = screen.getByLabelText(/recipient email/i);
    fireEvent.change(input, { target: { value: "not-an-email" } });
    expect(sendButton).toBeDisabled();
    expect(screen.getByText(/enter a valid email address/i)).toBeTruthy();

    fireEvent.change(input, { target: { value: "valid@example.com" } });
    expect(sendButton).not.toBeDisabled();
  });

  it("re-seeds from defaultEmail each time it is reopened, discarding a prior edit", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <PodEmailConfirmDialog
        open
        onOpenChange={() => {}}
        defaultEmail="first-job@example.com"
        documentLabel="Job AX0001's POD"
        sending={false}
        onConfirm={onConfirm}
      />
    );

    fireEvent.change(screen.getByLabelText(/recipient email/i), {
      target: { value: "edited-but-abandoned@example.com" },
    });

    // Close, then reopen for a *different* job.
    rerender(
      <PodEmailConfirmDialog
        open={false}
        onOpenChange={() => {}}
        defaultEmail="first-job@example.com"
        documentLabel="Job AX0001's POD"
        sending={false}
        onConfirm={onConfirm}
      />
    );
    rerender(
      <PodEmailConfirmDialog
        open
        onOpenChange={() => {}}
        defaultEmail="second-job@example.com"
        documentLabel="Job AX0002's POD"
        sending={false}
        onConfirm={onConfirm}
      />
    );

    expect((screen.getByLabelText(/recipient email/i) as HTMLInputElement).value).toBe(
      "second-job@example.com"
    );
  });

  it("does not allow closing while a send is in progress", () => {
    const onOpenChange = vi.fn();
    render(
      <PodEmailConfirmDialog
        open
        onOpenChange={onOpenChange}
        defaultEmail="onfile@example.com"
        documentLabel="Job AX0063's POD"
        sending
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /send email/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });
});
