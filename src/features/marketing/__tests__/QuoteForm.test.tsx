import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const submitMock = vi.fn();
vi.mock("../lib/submitMovementRequest", () => ({
  submitMovementRequest: (...args: unknown[]) => submitMock(...args),
}));

import { QuoteForm } from "../components/QuoteForm";

function renderForm() {
  return render(
    <MemoryRouter>
      <QuoteForm />
    </MemoryRouter>,
  );
}

describe("QuoteForm", () => {
  beforeEach(() => submitMock.mockReset());

  it("blocks submission and shows validation errors when required fields are empty", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /request a vehicle movement/i }));

    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("keeps the not-a-booking disclaimer visible", () => {
    renderForm();
    expect(
      screen.getByText(/wait for written confirmation from axentra/i),
    ).toBeInTheDocument();
  });
});
