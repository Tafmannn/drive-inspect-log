// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DriverJobCard } from "@/components/DriverJobCard";
import type { DriverJobSummary } from "@/lib/driverJobSummary";

const today = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function summary(over: Partial<DriverJobSummary> = {}, raw: Record<string, unknown> = {}): DriverJobSummary {
  return {
    job_id: "j1", job_ref: "AX-1011", vehicle_reg: "AB11 CDE", client_name: "Northgate Motors",
    workflow_state: "ready", action_state: "actionable", priority_state: "normal", recommendation_reason: null, constraints: [],
    pickup_postcode: "M1 1AA", delivery_postcode: "LS1 1AA", pickup_company: "Northern Dealer Group", delivery_company: null,
    pickup_contact_name: "Pat Pickup", pickup_contact_phone: "07700 900001", pickup_address_full: "11 High Street, Manchester, M1 1AA",
    delivery_contact_name: "Dee Delivery", delivery_contact_phone: "07700 900002", delivery_address_full: "11 Station Road, Leeds, LS1 1AA",
    current_contact_name: "Pat Pickup", current_contact_phone: "07700 900001",
    route_distance_miles: 43.6, route_eta_minutes: 60, route_metrics_reliable: true,
    primary_cta: { label: "Start Pickup", route: "/inspection/j1/pickup" }, nav_address: "11 High Street, Manchester, M1 1AA",
    _raw: {
      id: "j1", status: "ready_for_pickup", vehicle_make: "Volkswagen", vehicle_model: "Golf", pickup_city: "Manchester", delivery_city: "Leeds",
      job_date: iso(today), pickup_time_from: "09:00:00", pickup_time_to: "12:00:00", ...raw,
    },
    ...over,
  } as unknown as DriverJobSummary;
}
afterEach(() => cleanup());

describe("DriverJobCard (compact)", () => {
  it("shows plate, vehicle, client, ref, route and when, in a few lines", () => {
    render(<DriverJobCard summary={summary()} onPrimaryAction={() => {}} onCardClick={() => {}} />);
    expect(screen.getByText("Volkswagen Golf")).toBeTruthy();
    expect(screen.getByText("Northgate Motors")).toBeTruthy();
    expect(screen.getByText("AX-1011")).toBeTruthy();
    expect(screen.getByText("Manchester, M1 1AA")).toBeTruthy();
    expect(screen.getByText("Leeds, LS1 1AA")).toBeTruthy();
    expect(screen.getByText(/· Northern Dealer Group/)).toBeTruthy();
    expect(screen.getByText("Today · 09:00–12:00 · 44 mi")).toBeTruthy();
  });

  it("keeps the registration visible in its own mobile-friendly row", () => {
    render(<DriverJobCard summary={summary()} onPrimaryAction={() => {}} onCardClick={() => {}} />);
    const plate = screen.getByRole("img", { name: "Vehicle registration AB11 CDE" });
    expect(plate.parentElement?.className).toContain("flex min-w-0 items-center");
    expect(plate.querySelector("img")?.getAttribute("src")).toBe("/assets/axentra-uk-plate.png");
    expect(plate.parentElement?.contains(screen.getByText("Volkswagen Golf"))).toBe(false);
  });

  it("hides the distance when route metrics aren't reliable", () => {
    render(<DriverJobCard summary={summary({ route_metrics_reliable: false })} onPrimaryAction={() => {}} onCardClick={() => {}} />);
    expect(screen.getByText("Today · 09:00–12:00")).toBeTruthy();
  });

  it("calls and navigates to the current leg, and runs the next step without opening the job", () => {
    const onPrimaryAction = vi.fn();
    const onCardClick = vi.fn();
    render(<DriverJobCard summary={summary()} onPrimaryAction={onPrimaryAction} onCardClick={onCardClick} />);
    expect(screen.getByRole("link", { name: "Call Pat Pickup" }).getAttribute("href")).toBe("tel:07700 900001");
    expect(screen.getByRole("link", { name: "Navigate" }).getAttribute("href")).toContain(encodeURIComponent("11 High Street, Manchester, M1 1AA"));
    fireEvent.click(screen.getByRole("button", { name: /Start Pickup/ }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Northgate Motors"));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it("disables Call when the current contact has no phone, and falls back to the full address", () => {
    render(
      <DriverJobCard
        summary={summary({ current_contact_phone: "", pickup_postcode: "" }, { pickup_city: "" })}
        onPrimaryAction={() => {}}
        onCardClick={() => {}}
      />,
    );
    expect((screen.getByRole("button", { name: "No phone number" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("11 High Street, Manchester, M1 1AA")).toBeTruthy();
  });

  it("flags a do-not-deliver-before restriction", () => {
    render(
      <DriverJobCard
        summary={summary({ constraints: [{ kind: "do_not_deliver_before", label: "Do not deliver before 14:00" }] as DriverJobSummary["constraints"] })}
        onPrimaryAction={() => {}}
        onCardClick={() => {}}
      />,
    );
    expect(screen.getByText("Do not deliver before 14:00")).toBeTruthy();
  });
});
