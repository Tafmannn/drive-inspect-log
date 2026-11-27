// @vitest-environment jsdom
/** CC / BCC on the invoice email confirm dialog. */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PodEmailConfirmDialog, parseAddressList } from "@/components/PodEmailConfirmDialog";

function renderDialog(allowCopies: boolean) {
  const onConfirm = vi.fn();
  render(
    <PodEmailConfirmDialog
      open
      onOpenChange={() => {}}
      defaultEmail="accounts@client.example"
      documentLabel="Invoice AX26-1011"
      sending={false}
      allowCopies={allowCopies}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("parseAddressList", () => {
  it("splits on commas, semicolons and spaces, de-duplicates and reports bad entries", () => {
    expect(parseAddressList("a@x.co, b@x.co; A@x.co  nope")).toEqual({ addresses: ["a@x.co", "b@x.co"], invalid: ["nope"] });
    expect(parseAddressList("   ")).toEqual({ addresses: [], invalid: [] });
  });
});

describe("invoice email CC / BCC", () => {
  it("is not offered where copies are not allowed (POD emails)", () => {
    renderDialog(false);
    expect(screen.queryByRole("button", { name: /add cc/i })).toBeNull();
  });

  it("sends the copies, dropping the main recipient and CC'd addresses from BCC", () => {
    const onConfirm = renderDialog(true);
    fireEvent.click(screen.getByRole("button", { name: /add cc \/ bcc/i }));
    fireEvent.change(screen.getByLabelText("CC"), { target: { value: "ops@client.example, accounts@client.example" } });
    fireEvent.change(screen.getByLabelText("BCC"), { target: { value: "me@axentra.example; ops@client.example" } });
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    expect(onConfirm).toHaveBeenCalledWith("accounts@client.example", { cc: ["ops@client.example"], bcc: ["me@axentra.example"] });
  });

  it("blocks sending while a copy address is invalid", () => {
    const onConfirm = renderDialog(true);
    fireEvent.click(screen.getByRole("button", { name: /add cc \/ bcc/i }));
    fireEvent.change(screen.getByLabelText("CC"), { target: { value: "ops@client" } });
    expect(screen.getByText(/Not a valid email: ops@client/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /send email/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sends empty copy lists when none are entered", () => {
    const onConfirm = renderDialog(true);
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    expect(onConfirm).toHaveBeenCalledWith("accounts@client.example", { cc: [], bcc: [] });
  });
});

describe("sending note", () => {
  it("tells the admin to keep the screen open while the pack is built", () => {
    render(
      <PodEmailConfirmDialog
        open
        onOpenChange={() => {}}
        defaultEmail="a@b.co"
        documentLabel="Invoice X"
        sending
        sendingNote="Preparing the invoice pack"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Preparing the invoice pack");
  });
});
