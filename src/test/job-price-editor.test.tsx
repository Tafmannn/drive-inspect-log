/**
 * Saving a price in the editor writes job_pricing only (the price columns are gone from jobs).
 * A failed save is reported and not swallowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ saved: vi.fn(), jobUpdate: vi.fn(), jobError: null as null | { message: string }, toast: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (v: unknown) => ({ eq: async () => (h.jobUpdate(v), { error: h.jobError }) }),
    }),
  },
}));
vi.mock("@/lib/jobPricingApi", () => ({ saveJobPricing: h.saved }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: false }) }));

import { JobPriceEditor } from "@/components/JobPriceEditor";

const ui = (price: number | null = 100) => (
  <QueryClientProvider client={new QueryClient()}>
    <JobPriceEditor jobId="j1" initialTotalPrice={price} initialRatePerMile={null} />
  </QueryClientProvider>
);

beforeEach(() => {
  h.saved.mockReset().mockResolvedValue(undefined);
  h.jobUpdate.mockReset();
  h.toast.mockReset();
  h.jobError = null;
});

describe("JobPriceEditor save", () => {
  it("writes job_pricing with the new values and never touches the jobs table", async () => {
    render(ui());
    fireEvent.change(screen.getByLabelText(/Job price/), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: /Save price/ }));
    await waitFor(() => expect(h.saved).toHaveBeenCalledWith("j1", { total_price: 250, rate_per_mile: null }));
    expect(h.jobUpdate).not.toHaveBeenCalled();
  });

  it("clearing the price writes NULL to job_pricing", async () => {
    render(ui());
    fireEvent.change(screen.getByLabelText(/Job price/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save price/ }));
    await waitFor(() => expect(h.saved).toHaveBeenCalledWith("j1", { total_price: null, rate_per_mile: null }));
  });

  it("reports a failed save", async () => {
    h.saved.mockRejectedValue(new Error("denied"));
    render(ui());
    fireEvent.change(screen.getByLabelText(/Job price/), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Save price/ }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not update price" })));
  });
});
