import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobVehicleLookup } from "@/features/jobs/components/JobVehicleLookup";
import { VehicleComplianceCard, VehicleComplianceSummary } from "@/features/jobs/components/VehicleComplianceCard";
import { lookupVehicle } from "@/lib/vehicleLookupApi";
import { toast } from "@/hooks/use-toast";
import type { VehicleLookupResult } from "@/lib/vehicleLookupApi";

vi.mock("@/lib/vehicleLookupApi", () => ({ lookupVehicle: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
const lookup = vi.mocked(lookupVehicle);
const valid: VehicleLookupResult = { success: true, registration: "AB21CDE", make: "Ford", colour: "Blue", motStatus: "Valid", motExpiryDate: "2099-01-01", taxStatus: "Taxed", taxDueDate: "2099-02-01", checkedAt: new Date().toISOString() };
function form(initialRegistration = "AB21 CDE", disabled = false) {
  const formRef = createRef<HTMLFormElement>();
  const onFound = vi.fn();
  render(<form ref={formRef}><JobVehicleLookup formRef={formRef} initialRegistration={initialRegistration} disabled={disabled} onFound={onFound}><span>Other fields</span></JobVehicleLookup></form>);
  return onFound;
}
beforeEach(() => { vi.clearAllMocks(); lookup.mockReset(); });
describe("DVLA lookup on the job form", () => {
  it("requires a registration before invoking the service", () => {
    form(""); fireEvent.click(screen.getByRole("button", { name: "DVLA" }));
    expect(lookup).not.toHaveBeenCalled(); expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enter a registration first." }));
  });
  it("fills the form only for the matching vehicle and clears results when edited", async () => {
    lookup.mockResolvedValue(valid); const found = form();
    fireEvent.click(screen.getByRole("button", { name: "DVLA" }));
    await waitFor(() => expect(found).toHaveBeenCalledWith(valid));
    expect(screen.getByText("Valid")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Registration *"), { target: { value: "ZZ99ZZZ" } });
    expect(screen.queryByText("Valid")).toBeNull();
  });
  it("rejects a mismatched vehicle", async () => {
    lookup.mockResolvedValue({ ...valid, registration: "ZZ99ZZZ" }); const found = form();
    fireEvent.click(screen.getByRole("button", { name: "DVLA" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "DVLA could not verify this registration." })));
    expect(found).not.toHaveBeenCalled();
  });
  it("ignores a response after the registration changes in flight", async () => {
    let finish!: (value: VehicleLookupResult) => void;
    lookup.mockReturnValue(new Promise(resolve => { finish = resolve; })); const found = form();
    fireEvent.click(screen.getByRole("button", { name: "DVLA" }));
    fireEvent.change(screen.getByLabelText("Registration *"), { target: { value: "ZZ99ZZZ" } });
    await act(async () => { finish(valid); });
    expect(found).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "DVLA" })).toBeTruthy();
  });
  it("surfaces service errors without filling the form", async () => {
    lookup.mockRejectedValue(new Error("offline")); const found = form();
    fireEvent.click(screen.getByRole("button", { name: "DVLA" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "DVLA lookup failed" })));
    expect(found).not.toHaveBeenCalled();
  });
  it("disables lookup when the form is disabled", () => {
    form("AB21CDE", true);
    expect((screen.getByRole("button", { name: "DVLA" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
describe("manual pre-pickup compliance", () => {
  it("starts unverified and displays matching DVLA data", async () => {
    lookup.mockResolvedValue(valid);
    render(<VehicleComplianceCard registration="AB21 CDE" />);
    expect(screen.getByText("No verified timestamp", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check DVLA" }));
    await screen.findByText("Valid"); expect(screen.getByText("Taxed")).toBeTruthy();
  });
  it("shows an actionable warning on service rejection", async () => {
    lookup.mockRejectedValue(new Error("offline"));
    render(<VehicleComplianceCard registration="AB21CDE" />);
    fireEvent.click(screen.getByRole("button", { name: "Check DVLA" }));
    expect((await screen.findByRole("alert")).textContent).toContain("verify manually");
  });
  it("rejects mismatched results", async () => {
    lookup.mockResolvedValue({ ...valid, registration: "ZZ99ZZZ" });
    render(<VehicleComplianceCard registration="AB21CDE" />);
    fireEvent.click(screen.getByRole("button", { name: "Check DVLA" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not verify");
  });
  it("shows a stop warning for invalid MOT", () => {
    render(<VehicleComplianceSummary registration="AB21CDE" result={{ ...valid, motStatus: "Not valid" }} />);
    expect(screen.getByText(/Do not drive — MOT not valid/)).toBeTruthy();
  });
  it("does not display a stale vehicle's status", () => {
    render(<VehicleComplianceSummary registration="ZZ99ZZZ" result={valid} />);
    expect(screen.queryByText("Valid")).toBeNull();
    expect(screen.getByText(/DVLA status unverified/)).toBeTruthy();
  });
});
