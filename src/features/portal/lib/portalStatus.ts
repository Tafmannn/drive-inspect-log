/**
 * Customer-facing view of a job's status. The internal pipeline has ~16
 * statuses, several of which only matter to the operator (pod_ready vs
 * completed is an internal review step, for example). Clients see a short,
 * plain progression instead.
 */

export type PortalStage =
  | "booked"
  | "assigned"
  | "collecting"
  | "in_transit"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "issue";

const STAGE_BY_STATUS: Record<string, PortalStage> = {
  pending: "booked",
  incomplete: "booked",
  new: "booked",
  ready_for_pickup: "booked",
  assigned: "assigned",
  pickup_in_progress: "collecting",
  pickup_complete: "in_transit",
  in_transit: "in_transit",
  delivery_in_progress: "delivering",
  delivery_complete: "delivered",
  pod_ready: "delivered",
  completed: "delivered",
  cancelled: "cancelled",
  failed: "issue",
};

export const STAGE_LABEL: Record<PortalStage, string> = {
  booked: "Booked",
  assigned: "Driver assigned",
  collecting: "Collecting",
  in_transit: "In transit",
  delivering: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  issue: "Needs attention",
};

/** Unknown statuses read as "Booked" rather than leaking an internal name. */
export function portalStage(status: string | null | undefined): PortalStage {
  return (status && STAGE_BY_STATUS[status]) || "booked";
}

/**
 * The five steps of the progress bar; cancelled/issue jobs have no position.
 * "Out for delivery" is its own step so a vehicle on its final leg visibly
 * moves past "In transit".
 */
export const PROGRESS_STEPS = ["booked", "collected", "in_transit", "delivering", "delivered"] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

export function progressIndex(stage: PortalStage): number | null {
  switch (stage) {
    case "booked":
    case "assigned":
      return 0;
    case "collecting":
      return 1;
    case "in_transit":
      return 2;
    case "delivering":
      return 3;
    case "delivered":
      return 4;
    default:
      return null;
  }
}

/** Past tense once a step is done, present tense while it is happening. */
export function progressStepLabel(step: ProgressStep, state: "done" | "current" | "upcoming"): string {
  switch (step) {
    case "booked":
      return "Booked";
    case "collected":
      return state === "current" ? "Collecting" : "Collected";
    case "in_transit":
      return "In transit";
    case "delivering":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
  }
}

/** One plain sentence telling the client what happens next. */
export const STAGE_NEXT: Record<PortalStage, string> = {
  booked: "We've got your booking and will assign a driver shortly.",
  assigned: "A driver has been assigned and will collect the vehicle as scheduled.",
  collecting: "The driver is with the vehicle now, inspecting and photographing it before collection.",
  in_transit: "The vehicle has been collected and is on its way.",
  delivering: "The driver is at the delivery address and handing the vehicle over.",
  delivered: "The vehicle has been delivered. The full condition report is below.",
  cancelled: "This move was cancelled. Contact us if you need it rebooked.",
  issue: "Something needs our attention on this move. We'll be in touch, or contact us for an update.",
};

export function isActiveStage(stage: PortalStage): boolean {
  return stage !== "delivered" && stage !== "cancelled";
}

/**
 * Collapse the raw status-change log into customer-facing steps: internal
 * transitions that map to the same stage (e.g. delivery_complete -> pod_ready
 * -> completed, all "Delivered") appear once, at the first time it was reached.
 */
export function timelineSteps(
  timeline: { status: string; at: string }[],
): { stage: PortalStage; at: string }[] {
  const out: { stage: PortalStage; at: string }[] = [];
  for (const t of timeline) {
    const stage = portalStage(t.status);
    if (out.length > 0 && out[out.length - 1].stage === stage) continue;
    out.push({ stage, at: t.at });
  }
  return out;
}
