/**
 * Damage Inspection V2 — geometry quality gates for all 45 diagrams:
 * stable/known panel ids, every panel reachable by a tap, physically
 * consistent left/right in every view (no mirrored panels), arches/empty
 * space select nothing, and the nine families are genuinely different.
 */
import { describe, expect, it } from "vitest";
import { BODY_TYPES } from "@/features/damage/bodyTypes";
import { getDiagram, panelsForBodyType, VIEW_IDS, type DiagramView } from "@/features/damage/geometry/views";
import { resolveTap, fromPanelUV, toPanelUV } from "@/features/damage/hitTest";
import { isKnownPanel, PANELS, mirrorPanelId } from "@/features/damage/panels";
import { bbox } from "@/features/damage/geometry/poly";

const anchorOf = (d: DiagramView, id: string) => d.panels.find((p) => p.id === id)!.anchor;
const sideOf = (id: string) => PANELS[id].side;

describe.each(BODY_TYPES)("%s diagrams", (bt) => {
  it.each(VIEW_IDS)("%s view: known ids, unique, every panel reachable by tapping its anchor", (v) => {
    const d = getDiagram(bt, v);
    expect(d.panels.length).toBeGreaterThan(8);
    const ids = d.panels.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of d.panels) {
      expect(isKnownPanel(p.id), p.id).toBe(true);
      expect(resolveTap(d, p.anchor, 0).panelId, `${bt}/${v}/${p.id}`).toBe(p.id);
    }
  });

  it("side views only show their own side; end/plan views show both", () => {
    const left = getDiagram(bt, "left").panels.map((p) => p.id);
    const right = getDiagram(bt, "right").panels.map((p) => p.id);
    expect(left.some((id) => sideOf(id) === "right")).toBe(false);
    expect(right.some((id) => sideOf(id) === "left")).toBe(false);
    expect(right.sort()).toEqual(left.map(mirrorPanelId).sort());
    for (const v of ["top", "front", "rear"] as const) {
      const ids = getDiagram(bt, v).panels.map((p) => p.id);
      expect(ids.some((id) => sideOf(id) === "left")).toBe(true);
      expect(ids.some((id) => sideOf(id) === "right")).toBe(true);
    }
  });

  it("left/right are vehicle-relative in every camera view (mirror check)", () => {
    // Plan (front up) and rear: vehicle-left on the viewer's left (−x).
    // Front: viewer faces the car, so vehicle-left is on the viewer's right.
    const expectations = { top: -1, rear: -1, front: 1 } as const;
    for (const [v, sign] of Object.entries(expectations) as [keyof typeof expectations, number][]) {
      const d = getDiagram(bt, v);
      let pairs = 0;
      for (const p of d.panels) {
        if (sideOf(p.id) !== "left") continue;
        const twin = d.panels.find((q) => q.id === mirrorPanelId(p.id));
        if (!twin) continue;
        pairs++;
        expect(Math.sign(p.anchor[0] - twin.anchor[0]), `${v}: ${p.id} vs ${twin.id}`).toBe(sign);
      }
      expect(pairs).toBeGreaterThan(2);
    }
    // Left view: front of the vehicle at the viewer's left; right view: at the right.
    const L = getDiagram(bt, "left"), R = getDiagram(bt, "right");
    expect(anchorOf(L, "front_bumper")[0]).toBeLessThan(anchorOf(L, "rear_bumper")[0]);
    expect(anchorOf(R, "front_bumper")[0]).toBeGreaterThan(anchorOf(R, "rear_bumper")[0]);
    expect(anchorOf(L, "front_left_wheel")[0]).toBeLessThan(anchorOf(L, "rear_left_wheel")[0]);
    expect(anchorOf(R, "front_right_wheel")[0]).toBeGreaterThan(anchorOf(R, "rear_right_wheel")[0]);
    // Top view: front at the top of the screen.
    const T = getDiagram(bt, "top");
    expect(anchorOf(T, "front_bumper")[1]).toBeLessThan(anchorOf(T, "rear_bumper")[1]);
    expect(anchorOf(T, "bonnet")[1]).toBeLessThan(anchorOf(T, "windscreen")[1]);
    expect(anchorOf(T, "windscreen")[1]).toBeLessThan(anchorOf(T, "rear_bumper")[1]);
  });

  it("empty space and wheel-arch gaps select nothing", () => {
    for (const v of VIEW_IDS) {
      const d = getDiagram(bt, v);
      const vb = d.viewBox;
      expect(resolveTap(d, [vb.x + 1, vb.y + 1], 0).panelId).toBeNull();
      expect(resolveTap(d, [vb.x + vb.w - 1, vb.y + 1], 0).panelId).toBeNull();
    }
    for (const v of ["left", "right"] as const) {
      const d = getDiagram(bt, v);
      expect(d.holes.length).toBe(2);
      for (const hole of d.holes) {
        const b = bbox(hole);
        // just inside the top of the arch opening, above the tyre
        const gap: [number, number] = [b.x + b.w / 2, b.y + 2];
        const r = resolveTap(d, gap, 0);
        expect(r.panelId === null || PANELS[r.panelId!].kind === "Wheels", `${bt}/${v} arch gap → ${r.panelId}`).toBe(true);
        // the centre of the arch is the tyre itself
        expect(PANELS[resolveTap(d, [b.x + b.w / 2, b.y + b.h / 2], 0).panelId!].kind).toBe("Wheels");
      }
    }
  });

  it("panel-relative pin positions round-trip and stay on their panel", () => {
    for (const v of VIEW_IDS) {
      const d = getDiagram(bt, v);
      for (const p of d.panels) {
        const uv = toPanelUV(d, p.id, p.anchor)!;
        const back = fromPanelUV(d, p.id, uv)!;
        expect(Math.hypot(back[0] - p.anchor[0], back[1] - p.anchor[1])).toBeLessThan(0.01);
      }
    }
  });
});

describe("adjacent small panels", () => {
  it("a near-miss beside a mirror snaps to it; a tap well inside a door stays the door", () => {
    const d = getDiagram("saloon", "top");
    const mirror = d.panels.find((p) => p.id === "left_mirror")!;
    const nearMiss: [number, number] = [mirror.bbox.x - 3, mirror.anchor[1]];
    expect(resolveTap(d, nearMiss, 0).panelId).toBeNull();
    expect(resolveTap(d, nearMiss, 8).panelId).toBe("left_mirror");
    expect(resolveTap(d, anchorOf(d, "front_left_door"), 8).panelId).toBe("front_left_door");
  });

  it("ambiguous taps between two panels return candidates for the chooser", () => {
    const d = getDiagram("saloon", "front");
    // a point just outside the body between bumper and tyre edge region
    let foundAmbiguous = false;
    const vb = d.viewBox;
    for (let x = vb.x; x < vb.x + vb.w && !foundAmbiguous; x += 1) {
      for (let y = vb.y; y < vb.y + vb.h && !foundAmbiguous; y += 1) {
        const r = resolveTap(d, [x, y], 6);
        if (r.candidates.length > 1) {
          foundAmbiguous = true;
          expect(r.panelId).toBeNull();
          expect(new Set(r.candidates).size).toBe(r.candidates.length);
        }
      }
    }
    expect(foundAmbiguous).toBe(true);
  });
});

describe("body families are distinct vehicles", () => {
  it("every family has a different side silhouette and plan outline", () => {
    for (const v of ["left", "top", "front", "rear"] as const) {
      const outlines = new Set(BODY_TYPES.map((bt) => getDiagram(bt, v).outline));
      expect(outlines.size, v).toBe(BODY_TYPES.length);
    }
  });

  it("family-specific panels exist where they should", () => {
    expect(panelsForBodyType("van")).toEqual(
      expect.arrayContaining(["left_sliding_door", "left_load_side", "left_rear_cargo_door", "right_rear_cargo_door"]),
    );
    expect(panelsForBodyType("pickup")).toEqual(expect.arrayContaining(["load_bed", "tailgate", "left_bed_side", "right_bed_side"]));
    // the convertible artwork is roof-down: windscreen + stowed-roof deck, no roof panel
    expect(panelsForBodyType("convertible")).toEqual(expect.arrayContaining(["rear_deck", "boot", "windscreen"]));
    expect(panelsForBodyType("convertible")).not.toContain("roof");
    expect(panelsForBodyType("convertible")).not.toContain("front_left_window");
    expect(panelsForBodyType("coupe")).not.toContain("rear_left_door");
    expect(panelsForBodyType("saloon")).toContain("boot");
    expect(panelsForBodyType("hatchback")).toContain("tailgate");
    expect(panelsForBodyType("estate")).toContain("rear_left_quarter_glass");
    expect(panelsForBodyType("van")).not.toContain("rear_left_door");
  });

  it("proportions: van and SUV are taller for their length than a saloon; pickup bed behind the cab", () => {
    const aspect = (bt: (typeof BODY_TYPES)[number]) => {
      const vb = getDiagram(bt, "left").viewBox;
      return vb.h / vb.w;
    };
    expect(aspect("van")).toBeGreaterThan(aspect("saloon"));
    expect(aspect("suv")).toBeGreaterThan(aspect("saloon"));
    expect(aspect("mpv")).toBeGreaterThan(aspect("coupe"));
    const p = getDiagram("pickup", "top");
    expect(anchorOf(p, "load_bed")[1]).toBeGreaterThan(anchorOf(p, "roof")[1]);
  });
});

describe.each(BODY_TYPES)("%s uses its supplied illustration artwork", (bt) => {
  it.each(VIEW_IDS)("%s view: artwork is set and every panel lies on it", (v) => {
    const d = getDiagram(bt, v);
    expect(d.image?.href).toMatch(new RegExp(`${bt}/${v}.*\\.webp|${v}.*\\.webp`));
    expect(d.viewBox).toEqual({ x: 0, y: 0, w: d.image!.w, h: d.image!.h });
    for (const p of d.panels) {
      expect(p.bbox.x, p.id).toBeGreaterThanOrEqual(-1);
      expect(p.bbox.y, p.id).toBeGreaterThanOrEqual(-1);
      expect(p.bbox.x + p.bbox.w, p.id).toBeLessThanOrEqual(d.image!.w + 1);
      expect(p.bbox.y + p.bbox.h, p.id).toBeLessThanOrEqual(d.image!.h + 1);
    }
  });
  it("each view uses a different image from every other family", () => {
    for (const v of VIEW_IDS) {
      const mine = getDiagram(bt, v).image!.href;
      for (const other of BODY_TYPES.filter((b) => b !== bt)) expect(getDiagram(other, v).image!.href).not.toBe(mine);
    }
  });
});

describe("fingertip-sized panels next to big ones", () => {
  it("a tap inside a big panel right beside a thin strip asks; a tap deep inside does not", () => {
    // saloon left view: the roof is a thin strip along the top of the doors/windows
    const d = getDiagram("saloon", "left");
    const roof = d.panels.find((p) => p.id === "roof")!;
    const tol = 14 * (d.viewBox.w / 332); // 14 CSS px on a 390px phone
    expect(Math.min(roof.bbox.w, roof.bbox.h)).toBeLessThan(tol);
    // find a point just below the roof strip that lies inside another panel
    let probe: [number, number] | null = null;
    const cx = roof.anchor[0];
    for (let dy = 1; dy < tol; dy += 0.5) {
      const pt: [number, number] = [cx, roof.bbox.y + roof.bbox.h + dy];
      const r = resolveTap(d, pt, 0);
      if (r.panelId && r.panelId !== "roof") { probe = pt; break; }
    }
    expect(probe).not.toBeNull();
    const near = resolveTap(d, probe!, tol);
    expect(near.panelId).toBeNull();
    expect(near.candidates).toContain("roof");
    expect(near.candidates.length).toBeGreaterThan(1);
    // deep inside the front door: no prompt
    const door = d.panels.find((p) => p.id === "front_left_door")!;
    expect(resolveTap(d, door.anchor, tol)).toMatchObject({ panelId: "front_left_door" });
  });

  it("tapping the tiny panel itself still selects it directly", () => {
    const d = getDiagram("saloon", "left");
    const mirror = d.panels.find((p) => p.id === "left_mirror")!;
    const tol = 14 * (d.viewBox.w / 332);
    expect(resolveTap(d, mirror.anchor, tol).panelId).toBe("left_mirror");
  });
});
