/**
 * The "Link jobs to clients" screen: groups unlinked jobs, pre-selects a
 * suggested client, and only links what the admin confirms — through the
 * link_jobs_to_client RPC with exactly the ticked job ids.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const JOBS = [
  { id: "j1", external_job_number: "AX0001", vehicle_reg: "AB12 CDE", vehicle_make: "BMW", vehicle_model: "X5", client_company: "CJE Transport", client_name: "Chris Ellsworth", client_email: null, status: "completed", created_at: "2026-05-01T10:00:00Z", pickup_city: "Leeds", delivery_city: "York" },
  { id: "j2", external_job_number: "AX0002", vehicle_reg: "FG34 HIJ", vehicle_make: null, vehicle_model: null, client_company: "cje transport", client_name: "Chris  Ellsworth", client_email: null, status: "completed", created_at: "2026-05-02T10:00:00Z", pickup_city: null, delivery_city: null },
  { id: "j3", external_job_number: "AX0003", vehicle_reg: "KL56 MNO", vehicle_make: null, vehicle_model: null, client_company: null, client_name: "Rovello Automotive", client_email: null, status: "completed", created_at: "2026-05-03T10:00:00Z", pickup_city: null, delivery_city: null },
  { id: "j4", external_job_number: "AX0004", vehicle_reg: "PQ78 RST", vehicle_make: null, vehicle_model: null, client_company: null, client_name: "JCT600", client_email: null, status: "completed", created_at: "2026-05-04T10:00:00Z", pickup_city: null, delivery_city: null },
  { id: "j5", external_job_number: null, vehicle_reg: "UV90 WXY", vehicle_make: null, vehicle_model: null, client_company: null, client_name: null, client_email: null, status: "archived", created_at: "2026-05-05T10:00:00Z", pickup_city: null, delivery_city: null },
];
const CLIENTS = [
  { id: "cje", name: "Chris Ellsworth", company: "CJE Transport", email: null, billing_email: null, contact_name: "Chris Ellsworth", contact_email: null, is_active: true },
  { id: "rev", name: "Revillo Automotive", company: "Revillo Automotive", email: null, billing_email: null, contact_name: "Lewis Pythian", contact_email: null, is_active: true },
];

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "jobs") {
        return {
          select: (_cols: string, opts?: { head?: boolean }) =>
            opts?.head
              ? { eq: () => Promise.resolve({ count: 10, error: null }) }
              : { is: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: JOBS, error: null }) }) }) }) },
        };
      }
      if (table === "clients") {
        return { select: () => ({ order: () => Promise.resolve({ data: CLIENTS, error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => ({ isAdmin: true, isSuperAdmin: false }) };
});

import LinkJobsToClients from "@/features/clients/pages/LinkJobsToClients";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LinkJobsToClients />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cardOf = (text: string) => screen.getByText(text).closest(".rounded-lg") as HTMLElement;

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 2, error: null });
});

describe("LinkJobsToClients", () => {
  it("shows progress and one card per recorded client, with suggestions", async () => {
    renderPage();
    expect(await screen.findByText("CJE Transport")).toBeInTheDocument();
    expect(screen.getByText(/of/, { selector: "p" })).toHaveTextContent("5 of 10 jobs are linked to a client. 5 still to link.");

    const cje = cardOf("CJE Transport");
    expect(within(cje).getByText("Exact match")).toBeInTheDocument();
    expect(within(cje).getByText("2 jobs")).toBeInTheDocument();

    expect(within(cardOf("Rovello Automotive")).getByText(/Check: similar company name/)).toBeInTheDocument();
    expect(within(cardOf("JCT600")).getByText(/No matching client/)).toBeInTheDocument();
    expect(within(cardOf("No client recorded")).getByText(/Tick the jobs/)).toBeInTheDocument();
  });

  it("links exactly the group's jobs to the suggested client", async () => {
    renderPage();
    const cje = cardOf(await screen.findByText("CJE Transport").then((el) => el.textContent!));
    fireEvent.click(within(cje).getByRole("button", { name: "Link 2" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("link_jobs_to_client", { p_job_ids: ["j1", "j2"], p_client_id: "cje" });
  });

  it("links only the ticked jobs", async () => {
    renderPage();
    const cje = cardOf(await screen.findByText("CJE Transport").then((el) => el.textContent!));
    fireEvent.click(within(cje).getByRole("button", { name: /Show jobs/ }));
    fireEvent.click(within(cje).getByRole("checkbox", { name: "Include FG34 HIJ" }));
    fireEvent.click(within(cje).getByRole("button", { name: "Link 1" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("link_jobs_to_client", { p_job_ids: ["j1"], p_client_id: "cje" });
  });

  it("can't link a group with no client chosen, or the no-details group with nothing ticked", async () => {
    renderPage();
    await screen.findByText("CJE Transport");
    expect(within(cardOf("JCT600")).getByRole("button", { name: "Link 1" })).toBeDisabled();
    expect(within(cardOf("No client recorded")).getByRole("button", { name: "Link 0" })).toBeDisabled();
  });

  it("'Link all exact matches' confirms first and links only exact groups", async () => {
    renderPage();
    await screen.findByText("CJE Transport");
    fireEvent.click(screen.getByRole("button", { name: "Link all exact matches (2)" }));
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Link 2 jobs" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("link_jobs_to_client", { p_job_ids: ["j1", "j2"], p_client_id: "cje" });
  });
});
