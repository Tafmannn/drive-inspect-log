/**
 * Views of the single Jobs screen (/control/jobs).
 *
 * The screen merges the old mobile queue (/admin/jobs: triage buckets,
 * missing-evidence acknowledgement, run order) and the old desktop table
 * (/control/jobs: server-filtered list, sort, KPIs). Each view says where its
 * rows come from:
 *   - "queue" views read the grouped triage data (useAdminJobQueues);
 *   - "list" views read the server-filtered list (useControlJobs);
 *   - the "aborts" view reads Abort requests and Aborts (src/features/abort).
 *
 * Old links keep working: `?filter=` (old /admin/jobs and dashboard buckets)
 * and `?status=` (old /control/jobs) are translated to `?view=`.
 */
import type { JobsFilter } from "../../hooks/useControlJobsData";

export type JobsView =
  | "queues"
  | "attention"
  | "unassigned"
  | "stale"
  | "evidence"
  | "active"
  | "review"
  | "completed"
  | "cancelled"
  | "aborts"
  | "all";

export interface JobsViewDef {
  value: JobsView;
  label: string;
  source: "queue" | "list" | "aborts";
  /** Server filter for list views. */
  listStatus?: JobsFilter["status"];
}

export const JOBS_VIEWS: JobsViewDef[] = [
  { value: "queues", label: "Queues", source: "queue" },
  { value: "attention", label: "Attention", source: "queue" },
  { value: "unassigned", label: "Unassigned", source: "list", listStatus: "unassigned" },
  { value: "stale", label: "Stale", source: "list", listStatus: "stale" },
  { value: "evidence", label: "Evidence", source: "queue" },
  { value: "active", label: "Active", source: "list", listStatus: "active" },
  { value: "review", label: "POD Review", source: "list", listStatus: "pod_review" },
  { value: "completed", label: "Completed", source: "list", listStatus: "completed" },
  { value: "cancelled", label: "Cancelled", source: "list", listStatus: "cancelled" },
  { value: "aborts", label: "Aborts", source: "aborts" },
  { value: "all", label: "All jobs", source: "list", listStatus: "all" },
];

export const DEFAULT_JOBS_VIEW: JobsView = "queues";

const VIEW_SET = new Set<string>(JOBS_VIEWS.map((v) => v.value));

/** Old /admin/jobs `?filter=` values (and dashboard bucket links). */
const LEGACY_FILTER: Record<string, JobsView> = {
  all: "queues",
  attention: "attention",
  stale: "stale",
  unassigned: "unassigned",
  evidence: "evidence",
  in_progress: "active",
  active: "active",
  driver: "active",
  review: "review",
  completed: "completed",
  cancelled: "cancelled",
  aborts: "aborts",
};

/** Old /control/jobs `?status=` values. */
const LEGACY_STATUS: Record<string, JobsView> = {
  all: "all",
  active: "active",
  pod_review: "review",
  completed: "completed",
  unassigned: "unassigned",
  stale: "stale",
};

export function resolveJobsView(params: URLSearchParams): JobsView {
  const view = params.get("view");
  if (view && VIEW_SET.has(view)) return view as JobsView;
  const status = params.get("status");
  if (status && LEGACY_STATUS[status]) return LEGACY_STATUS[status];
  const filter = params.get("filter");
  if (filter && LEGACY_FILTER[filter]) return LEGACY_FILTER[filter];
  return DEFAULT_JOBS_VIEW;
}

export function jobsViewDef(view: JobsView): JobsViewDef {
  return JOBS_VIEWS.find((v) => v.value === view) ?? JOBS_VIEWS[0];
}

/** URL for a view, keeping a search term if there is one. */
export function jobsViewUrl(view: JobsView, search = ""): string {
  const p = new URLSearchParams();
  if (view !== DEFAULT_JOBS_VIEW) p.set("view", view);
  // Keep the term as typed (spaces included) so the search box doesn't fight the user.
  if (search.trim()) p.set("search", search);
  const q = p.toString();
  return q ? `/control/jobs?${q}` : "/control/jobs";
}

/** Where an old /admin/jobs?… link should land now. */
export function legacyAdminJobsTarget(params: URLSearchParams): string {
  return jobsViewUrl(resolveJobsView(params), params.get("search") ?? "");
}

/** Fields a jobs search looks at. */
export interface SearchableJob {
  vehicle_reg?: string | null;
  external_job_number?: string | null;
  client_company?: string | null;
  client_name?: string | null;
  resolvedDriverName?: string | null;
  driver_name?: string | null;
  pickup_postcode?: string | null;
  delivery_postcode?: string | null;
  pickup_city?: string | null;
  delivery_city?: string | null;
}

/** One search rule for every jobs view (reg, ref, client, driver, cities, postcodes). */
export function matchesJobSearch(row: SearchableJob, term: string): boolean {
  const s = term.trim().toLowerCase();
  if (!s) return true;
  return [
    row.vehicle_reg, row.external_job_number, row.client_company, row.client_name,
    row.resolvedDriverName, row.driver_name, row.pickup_postcode, row.delivery_postcode,
    row.pickup_city, row.delivery_city,
  ].some((v) => !!v && v.toLowerCase().includes(s));
}
