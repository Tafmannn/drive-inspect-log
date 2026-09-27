// @vitest-environment jsdom
//
// QrConfirm is the customer-facing handover confirmation page — reached by
// scanning a QR code, filled in on whatever phone the customer has to hand,
// often with an impatient double-tap on a small "Confirm Handover" button.
//
// Two bugs found during a mobile-conditions audit:
//  1. handleConfirm had no re-entry guard. React state updates are async
//     and can be outraced by a second tap before re-render (the exact issue
//     InspectionFlow's submit button already guards against with a ref
//     mutex) — a double-tap could fire qr_confirm twice.
//  2. qr_confirm's own DB guard (token + confirmed_at IS NULL) means the
//     LOSING call of two concurrent confirms returns {status: "invalid"}
//     even though the handover was correctly recorded by the winner. The
//     page used to show that customer a flat "Invalid or expired link"
//     error, even though their tap (or the other tap) had actually worked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { QrConfirm } from "@/pages/QrConfirm";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/confirm?token=tok-1"]}>
      <Routes>
        <Route path="/confirm" element={<QrConfirm />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function readyScreen() {
  renderPage();
  await waitFor(() => expect(screen.getByText("Your Name *")).toBeTruthy());
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Pat Customer" } });
}

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation((fn: string) => {
    if (fn === "qr_lookup") {
      return Promise.resolve({
        data: { status: "ready", event_type: "collection", job_ref: "AX0001", vehicle_reg: "AB12 CDE" },
        error: null,
      });
    }
    return Promise.resolve({ data: { status: "done" }, error: null });
  });
});

describe("QrConfirm — duplicate tap", () => {
  it("a rapid double-tap fires qr_confirm only once", async () => {
    await readyScreen();
    const btn = screen.getByRole("button", { name: "Confirm Handover" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText("Handover Confirmed")).toBeTruthy());
    expect(mockRpc.mock.calls.filter((c) => c[0] === "qr_confirm")).toHaveLength(1);
  });

  it("a losing race (this tap's qr_confirm call returns invalid) re-checks and still shows success if the handover was actually recorded", async () => {
    let lookupCalls = 0;
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "qr_lookup") {
        lookupCalls++;
        // First call (page load) → ready; second call (post-loss re-check) → done,
        // reflecting that the OTHER concurrent tap/device won the race.
        return Promise.resolve({
          data: lookupCalls === 1
            ? { status: "ready", event_type: "collection", job_ref: "AX0001", vehicle_reg: "AB12 CDE" }
            : { status: "done" },
          error: null,
        });
      }
      if (fn === "qr_confirm") {
        return Promise.resolve({ data: { status: "invalid" }, error: null });
      }
      return Promise.resolve({ data: {}, error: null });
    });

    await readyScreen();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Handover" }));

    await waitFor(() => expect(screen.getByText("Handover Confirmed")).toBeTruthy());
  });

  it("a genuinely invalid/expired token still shows the error screen", async () => {
    let lookupCalls = 0;
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "qr_lookup") {
        lookupCalls++;
        return Promise.resolve({
          data: lookupCalls === 1
            ? { status: "ready", event_type: "collection", job_ref: "AX0001", vehicle_reg: "AB12 CDE" }
            : { status: "invalid" },
          error: null,
        });
      }
      return Promise.resolve({ data: { status: "invalid" }, error: null });
    });

    await readyScreen();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Handover" }));

    await waitFor(() => expect(screen.getByText("Invalid or expired link")).toBeTruthy());
  });
});
