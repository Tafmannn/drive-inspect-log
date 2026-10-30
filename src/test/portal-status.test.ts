import { describe, it, expect } from "vitest";
import {
  portalStage,
  progressIndex,
  isActiveStage,
  timelineSteps,
  STAGE_LABEL,
} from "@/features/portal/lib/portalStatus";

describe("portalStage", () => {
  it("collapses internal review states into Delivered", () => {
    expect(portalStage("delivery_complete")).toBe("delivered");
    expect(portalStage("pod_ready")).toBe("delivered");
    expect(portalStage("completed")).toBe("delivered");
  });

  it("maps the in-flight pipeline in order", () => {
    expect(portalStage("ready_for_pickup")).toBe("booked");
    expect(portalStage("assigned")).toBe("assigned");
    expect(portalStage("pickup_in_progress")).toBe("collecting");
    expect(portalStage("pickup_complete")).toBe("in_transit");
    expect(portalStage("delivery_in_progress")).toBe("delivering");
  });

  it("never surfaces an unknown internal status name", () => {
    expect(portalStage("some_new_internal_state")).toBe("booked");
    expect(portalStage(null)).toBe("booked");
    expect(STAGE_LABEL[portalStage("some_new_internal_state")]).toBe("Booked");
  });

  it("marks failures as needing attention, not as delivered", () => {
    expect(portalStage("failed")).toBe("issue");
    expect(portalStage("cancelled")).toBe("cancelled");
  });
});

describe("progressIndex / isActiveStage", () => {
  it("advances monotonically through the progress bar", () => {
    expect(progressIndex("booked")).toBe(0);
    expect(progressIndex("assigned")).toBe(0);
    expect(progressIndex("collecting")).toBe(1);
    expect(progressIndex("in_transit")).toBe(2);
    expect(progressIndex("delivering")).toBe(2);
    expect(progressIndex("delivered")).toBe(3);
  });

  it("has no progress position for cancelled or problem jobs", () => {
    expect(progressIndex("cancelled")).toBeNull();
    expect(progressIndex("issue")).toBeNull();
  });

  it("treats delivered and cancelled as finished", () => {
    expect(isActiveStage("delivered")).toBe(false);
    expect(isActiveStage("cancelled")).toBe(false);
    expect(isActiveStage("in_transit")).toBe(true);
  });
});

describe("timelineSteps", () => {
  it("shows each customer-facing stage once, at the first time it was reached", () => {
    const steps = timelineSteps([
      { status: "assigned", at: "2026-10-01T09:00:00Z" },
      { status: "pickup_in_progress", at: "2026-10-01T10:00:00Z" },
      { status: "pickup_complete", at: "2026-10-01T10:30:00Z" },
      { status: "delivery_in_progress", at: "2026-10-01T13:00:00Z" },
      { status: "delivery_complete", at: "2026-10-01T13:20:00Z" },
      { status: "pod_ready", at: "2026-10-01T13:21:00Z" },
      { status: "completed", at: "2026-10-01T15:00:00Z" },
    ]);
    expect(steps.map((s) => s.stage)).toEqual([
      "assigned", "collecting", "in_transit", "delivering", "delivered",
    ]);
    expect(steps.at(-1)?.at).toBe("2026-10-01T13:20:00Z");
  });

  it("returns an empty list for an empty log", () => {
    expect(timelineSteps([])).toEqual([]);
  });
});
