/**
 * The Fuel setting on the client form: it shows what is saved, defaults to "client pays
 * fuel" for a new client, and sends the choice when the form is saved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import React from "react";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const h = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
  upsertRateCard: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/hooks/useClients", () => ({
  useCreateClient: () => ({ mutateAsync: h.create, isPending: false }),
  useUpdateClient: () => ({ mutateAsync: h.update, isPending: false }),
  useClients: () => ({ data: [] }),
}));
vi.mock("@/lib/clientApi", () => ({
  getClientRateCardRow: vi.fn().mockResolvedValue(null),
  upsertClientRateCard: (...a: unknown[]) => h.upsertRateCard(...a),
}));

// Radix Select is awkward in jsdom; a native select exercises the same props.
type SelectProps = { value: string; onValueChange: (v: string) => void; children: React.ReactNode };
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: SelectProps) => (
    <select aria-label="Fuel" value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { ClientFormModal } from "@/features/clients/components/ClientFormModal";
import type { Client } from "@/lib/clientApi";

const client = (over: Partial<Client> = {}): Client => ({
  id: "c1", org_id: "o1", name: "Chris", company: "CJE Transport", email: null, phone: null,
  address: null, notes: null, is_active: true, created_at: "", updated_at: "",
  billing_email: "a@b.co", payment_terms: null, po_required: false,
  ...over,
});

const fuel = () => within(screen.getByTestId("client-fuel-policy")).getByLabelText("Fuel") as HTMLSelectElement;

describe("Fuel setting on the client form", () => {
  beforeEach(() => {
    h.update.mockReset().mockResolvedValue({});
    h.create.mockReset().mockResolvedValue({ id: "new-1" });
    h.upsertRateCard.mockReset().mockResolvedValue(undefined);
  });

  it("offers both choices, in plain words", () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client()} />);
    const options = Array.from(fuel().options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ["recharged", "Client pays fuel (billed on the invoice)"],
      ["included", "Fuel included in the price"],
    ]);
  });

  it("shows what is saved for a fuel-included client, with its help text", async () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client({ fuel_policy: "included" })} />);
    await waitFor(() => expect(fuel().value).toBe("included"));
    expect(screen.getByText(/The quote already covers fuel/)).toBeInTheDocument();
  });

  it("a client with no saved value shows 'client pays fuel'", () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client({ fuel_policy: null })} />);
    expect(fuel().value).toBe("recharged");
  });

  it("saves the changed choice with the client", async () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client()} />);
    fireEvent.change(fuel(), { target: { value: "included" } });
    expect(screen.getByText(/The quote already covers fuel/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0]).toMatchObject({ id: "c1", input: { fuel_policy: "included" } });
  });

  it("a new client starts as 'client pays fuel' and is created with that", async () => {
    render(<ClientFormModal open onOpenChange={() => {}} initialCompany="Acme" />);
    expect(fuel().value).toBe("recharged");
    fireEvent.change(screen.getByLabelText(/Billing email/i), { target: { value: "acc@acme.co" } });
    fireEvent.change(screen.getByLabelText(/Client type/i), { target: { value: "dealer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Client" }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][0]).toMatchObject({ fuel_policy: "recharged", company: "Acme" });
  });
});

const invoicing = () => within(screen.getByTestId("client-billing-method")).getByLabelText("Fuel") as HTMLSelectElement; // the Select mock labels every select "Fuel"

describe("Invoicing (self-billing) setting on the client form", () => {
  beforeEach(() => {
    h.update.mockReset().mockResolvedValue({});
    h.create.mockReset().mockResolvedValue({ id: "new-1" });
    h.upsertRateCard.mockReset().mockResolvedValue(undefined);
  });

  it("defaults to 'we invoice them', including clients saved before the setting existed", () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client()} />);
    expect(invoicing().value).toBe("we_invoice");
    expect(Array.from(invoicing().options).map((o) => o.textContent)).toEqual([
      "We invoice them",
      "They invoice themselves (self-billing)",
    ]);
  });

  it("saves a client as self-billing, with help text saying what that does", async () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client()} />);
    fireEvent.change(invoicing(), { target: { value: "self_billed" } });
    expect(screen.getByText(/record their invoice instead/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0]).toMatchObject({ id: "c1", input: { billing_method: "self_billed" } });
  });

  it("doesn't send the setting for a client saved before it existed, unless self-billing is chosen", async () => {
    render(<ClientFormModal open onOpenChange={() => {}} client={client()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0].input).not.toHaveProperty("billing_method");
  });
});
