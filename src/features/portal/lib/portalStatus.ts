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

/** The four steps of the progress bar; null for cancelled/issue jobs, which don't progress. */
export const PROGRESS_STEPS: PortalStage[] = ["booked", "collecting", "in_transit", "delivered"];

export function progressIndex(stage: PortalStage): number | null {
  switch (stage) {
    case "booked":
    case "assigned":
      return 0;
    case "collecting":
      return 1;
    case "in_transit":
    case "delivering":
      return 2;
    case "delivered":
      return 3;
    default:
      return null;
  }
}

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
