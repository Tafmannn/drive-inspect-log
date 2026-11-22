import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { DamageInspector } from "@/features/damage/components/DamageInspector";
import { resolveBodyType, type BodyType } from "@/features/damage/bodyTypes";
import type { DamageItemDraft } from "@/lib/types";

const wide = true;
const realMM = window.matchMedia;
beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("min-width") ? wide : false,
    media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterAll(() => { window.matchMedia = realMM; });

function Harness({ initial = [] as DamageItemDraft[], vehicleType = "Saloon" as string | null, onState = (_: DamageItemDraft[]) => {} }) {
  const [damages, setDamages] = useState(initial);
  const [manual, setManual] = useState("");
  const [none, setNone] = useState(false);
  return (
    <DamageInspector
      inspectionType="pickup"
      damages={damages}
      onDamagesChange={(u) => setDamages((p) => { const n = u(p); onState(n); return n; })}
      bodyType={resolveBodyType({ manual, jobVehicleType: vehicleType })}
      onChooseBodyType={(bt: BodyType) => setManual(bt)}
      noDamageConfirmed={none}
      onNoDamageConfirmedChange={setNone}
    />
  );
}

const panel = (id: string) => document.querySelector(`[data-panel-id="${id}"]`) as Element;

describe("DamageInspector", () => {
  it("unknown body type shows the picker instead of assuming a saloon", () => {
    render(<Harness vehicleType="Ford" />);
    expect(screen.getByText(/What shape is this vehicle/)).toBeInTheDocument();
    expect(document.querySelector("[data-panel-id]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Van/ }));
    expect(screen.getByText(/chosen manually/)).toBeInTheDocument();
    // van top view has van-specific panels
    expect(panel("left_sliding_door")).not.toBeNull();
  });

  it("five tabs render genuinely different views, keeping physical sides", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Top", "Front", "Rear", "Left", "Right"]);
    fireEvent.click(screen.getByRole("tab", { name: /Left/ }));
    expect(panel("front_left_door")).not.toBeNull();
    expect(panel("front_right_door")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Right/ }));
    expect(panel("front_right_door")).not.toBeNull();
    expect(panel("front_left_door")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Front/ }));
    expect(panel("windscreen")).not.toBeNull();
    expect(panel("boot")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Rear/ }));
    expect(panel("boot")).not.toBeNull();
  });

  it("tap panel → details → save creates a record with the tapped panel; edit, delete, undo", () => {
    const states: DamageItemDraft[][] = [];
    render(<Harness onState={(s) => states.push(s)} />);
    fireEvent.click(panel("front_left_door"));
    expect(screen.getAllByText("Front Left Door").length).toBeGreaterThan(0);
    // validation blocks an incomplete record
    fireEvent.click(screen.getByRole("button", { name: "Save damage" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Damage type, Severity/);
    fireEvent.click(screen.getByRole("button", { name: "Scratch" }));
    fireEvent.click(screen.getByRole("radio", { name: /Minor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save damage" }));
    let last = states.at(-1)!;
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ panelId: "front_left_door", viewId: "top", bodyType: "saloon", severity: "minor", area: "Nearside", item: "Front Left Door", damageTypes: ["Scratch"] });

    // second damage on the SAME panel
    fireEvent.click(panel("front_left_door"));
    fireEvent.click(screen.getByRole("button", { name: "Dent" }));
    fireEvent.click(screen.getByRole("radio", { name: /Severe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save damage" }));
    last = states.at(-1)!;
    expect(last.map((d) => d.panelId)).toEqual(["front_left_door", "front_left_door"]);
    expect(screen.getByText("Recorded damages (2)")).toBeInTheDocument();

    // switching views keeps records
    fireEvent.click(screen.getByRole("tab", { name: /Rear/ }));
    expect(screen.getByText("Recorded damages (2)")).toBeInTheDocument();

    // edit from the list (returns to its view)
    const list = screen.getByText("Recorded damages (2)").closest("section")!;
    fireEvent.click(within(list).getAllByRole("button", { name: /Front Left Door/ })[0]);
    expect(screen.getByRole("tab", { name: /Top/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Moderate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(states.at(-1)![0].severity).toBe("moderate");

    // delete needs confirmation, then can be undone
    fireEvent.click(within(list).getAllByRole("button", { name: /Front Left Door/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Delete this damage" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete damage" }));
    expect(states.at(-1)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(states.at(-1)).toHaveLength(2);
    expect(states.at(-1)![1].damageTypes).toEqual(["Dent"]);
  });

  it("empty-space tap selects nothing and there is no Clear All", () => {
    render(<Harness />);
    fireEvent.click(document.querySelector("svg[role=img]")!);
    expect(screen.getByText(/Tap a panel to record damage/)).toBeInTheDocument();
    expect(screen.queryByText(/Clear all/i)).toBeNull();
  });

  it("explicit 'no damage found' is distinct from an empty list", () => {
    render(<Harness />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/no damage found/)).toBeInTheDocument();
  });

  it("existing records without a panel stay visible and are labelled", () => {
    render(<Harness initial={[{ tempId: "old", x: 5, y: 5, area: "Offside", location: "Panels", item: "Wing", damageTypes: ["Dent"], notes: "" }]} />);
    expect(screen.getByText("Offside – Wing")).toBeInTheDocument();
    expect(screen.getByText(/Not linked to a panel/)).toBeInTheDocument();
  });
});
vi.setConfig({ testTimeout: 20000 });
