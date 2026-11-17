/**
 * Views of the single POD review screen (/control/pod-review).
 *
 * "all" is the grouped review queue (missing inspection / missing signatures /
 * ready to confirm, plus recently completed). The others are flat lists.
 * Old /admin/pod-review `?filter=` values are translated.
 */
import type { ClosureStatusFilter } from "../../hooks/useClosureReview";

export const POD_VIEWS: { value: ClosureStatusFilter; label: string }[] = [
  { value: "all", label: "Review queue" },
  { value: "ready", label: "Ready to confirm" },
  { value: "missing_signatures", label: "Missing signatures" },
  { value: "missing_delivery_inspection", label: "No delivery insp." },
  { value: "pod_ready", label: "POD ready" },
  { value: "delivery_complete", label: "Delivery complete" },
  { value: "recently_completed", label: "Completed (7d)" },
];

const VIEW_SET = new Set<string>(POD_VIEWS.map((v) => v.value));

/** Old /admin/pod-review band names. */
const LEGACY: Record<string, ClosureStatusFilter> = {
  missing_inspection: "missing_delivery_inspection",
  completed: "recently_completed",
};

export function resolvePodView(params: URLSearchParams): ClosureStatusFilter {
  const v = params.get("view") ?? params.get("filter");
  if (v && VIEW_SET.has(v)) return v as ClosureStatusFilter;
  if (v && LEGACY[v]) return LEGACY[v];
  return "all";
}

export function podViewQuery(view: ClosureStatusFilter, search = ""): URLSearchParams {
  const p = new URLSearchParams();
  if (view !== "all") p.set("view", view);
  if (search.trim()) p.set("search", search);
  return p;
}

export function podViewUrl(view: ClosureStatusFilter, search = ""): string {
  const q = podViewQuery(view, search).toString();
  return q ? `/control/pod-review?${q}` : "/control/pod-review";
}

/** Confirm (complete) is offered only on closure-stage jobs. */
export function canConfirmReview(row: { status: string }): boolean {
  return row.status === "pod_ready" || row.status === "delivery_complete";
}
