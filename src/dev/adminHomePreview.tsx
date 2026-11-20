/**
 * DEV-ONLY visual preview for the Admin Home (`/` for admins).
 *
 * Served by Vite dev at /preview/admin-home.html — NOT part of `vite build`
 * (the build only uses index.html). Renders the REAL <Dashboard /> with a
 * React Query cache pre-seeded from the MOCK FIXTURES below, so no Supabase
 * data is read or written. Run with VITE_ENABLE_AUTH=false so AuthProvider
 * uses the dev user path (overrideRoles).
 *
 *   ?fixture=busy | calm | invoicing | worst | loading
 *   ?role=ADMIN | SUPERADMIN
 *   ?theme=dark
 *
 * Every navigation lands on a catch-all route that prints the target path,
 * which the visual/functional QA script asserts against.
 */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import type { AppRole } from "@/context/AuthContext";
import { Dashboard } from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const fixture = params.get("fixture") ?? "busy";
const role = (params.get("role") ?? "ADMIN") as AppRole;
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

type Row = Record<string, unknown>;
const job = (
  id: string, ref: string, reg: string, status: string, hoursAgo: number,
  driver: string | null, from = "LS1 4AP", to = "M1 2HQ",
): Row => ({
  id, external_job_number: ref, vehicle_reg: reg, status,
  driver_id: driver ? `drv-${id}` : null, driver_name: driver,
  resolvedDriverName: driver, pickup_city: "Leeds", pickup_postcode: from,
  delivery_city: "Manchester", delivery_postcode: to, job_date: iso(hoursAgo).slice(0, 10),
  updated_at: iso(hoursAgo), has_pickup_inspection: true, has_delivery_inspection: true,
});

// MOCK FIXTURES — illustrative values only, not production data.
const busyRows = {
  unassigned: [job("u1", "AXN-10511", "YD21 KXL", "ready_for_pickup", 3, null, "LS1 4AP", "B1 1BB")],
  stale: [job("s1", "AXN-10477", "BK19 TFO", "in_transit", 31, "Daniel Okafor", "NE1 7RU", "SW1A 1AA")],
  review: [
    job("r1", "AXN-10482", "WR70 HJN", "pod_ready", 2, "Priya Shah"),
    job("r2", "AXN-10490", "LC68 PZE", "delivery_complete", 5, "Tom Fletcher", "CF10 1EP", "BS1 4DJ"),
  ],
  inProgress: [job("p1", "AXN-10502", "GF22 MOU", "pickup_in_progress", 1, "Aisha Khan", "OX1 1HP", "RG1 1JX")],
  completed: [job("c1", "AXN-10466", "EX17 BNV", "completed", 20, "Priya Shah")],
};

const longRows = {
  unassigned: [job("u1", "AXN-1051199-CUSTOMER-REF-LONG", "YD21 KXL", "ready_for_pickup", 3, null, "WC2N 5DU", "KW15 1XH")],
  stale: [job("s1", "AXN-10477", "BK19 TFO", "in_transit", 300, "Maximiliana Alexandra Featherstonehaugh-Worthington", "NE1 7RU", "SW1A 1AA")],
  review: [job("r1", "AXN-10482", "WR70 HJN", "pod_ready", 2, "Zhāng Wěi")],
  inProgress: [],
  completed: [],
};

function queuesFrom(r: typeof busyRows) {
  return {
    needsAttention: [...r.unassigned, ...r.stale],
    unassigned: r.unassigned,
    inProgress: r.inProgress,
    review: r.review,
    completed: r.completed,
    missingEvidence: [],
    truncated: false,
  };
}

const exceptionsBusy = [{
  id: "ex1", severity: "high", category: "evidence", createdAt: iso(6), jobNumber: "AXN-10455",
  title: "Delivery photos failed to upload", detail: "4 of 8 photos missing on delivery inspection",
  actionLabel: "Review", actionRoute: "/jobs/ex-job/pod",
}];

const zeroBuckets = {
  todays_active: 0, needs_driver_action: 0, needs_admin_review: 0, blocked_evidence: 0,
  ready_to_close: 0, ready_to_invoice: 0, completed_not_invoiced: 0, failed_uploads: 0, cancelled_archived: 0,
};

const fixtures: Record<string, Record<string, unknown> | null> = {
  busy: {
    queues: queuesFrom(busyRows),
    kpis: { active: 14, podReview: 2, unassigned: 1, stale: 1 },
    evidence: 1,
    compliance: { pendingReview: 2, missingDocs: 1, expiredLicences: 0 },
    buckets: { ...zeroBuckets, todays_active: 9, needs_driver_action: 12, needs_admin_review: 2, blocked_evidence: 1, ready_to_close: 1, ready_to_invoice: 3, completed_not_invoiced: 68, cancelled_archived: 41 },
    attention: { exceptions: exceptionsBusy },
  },
  invoicing: {
    queues: queuesFrom({ unassigned: [], stale: [], review: [], inProgress: busyRows.inProgress, completed: busyRows.completed }),
    kpis: { active: 6, podReview: 0, unassigned: 0, stale: 0 },
    evidence: 0,
    compliance: { pendingReview: 0, missingDocs: 0, expiredLicences: 0 },
    buckets: { ...zeroBuckets, todays_active: 4, needs_driver_action: 6, ready_to_invoice: 3, completed_not_invoiced: 68, cancelled_archived: 41 },
    attention: { exceptions: [] },
  },
  calm: {
    queues: queuesFrom({ unassigned: [], stale: [], review: [], inProgress: [], completed: [] }),
    kpis: { active: 0, podReview: 0, unassigned: 0, stale: 0 },
    evidence: 0,
    compliance: { pendingReview: 0, missingDocs: 0, expiredLicences: 0 },
    buckets: zeroBuckets,
    attention: { exceptions: [] },
  },
  worst: {
    queues: queuesFrom(longRows),
    kpis: { active: 12840, podReview: 1203, unassigned: 987, stale: 45210 },
    evidence: 10234,
    compliance: { pendingReview: 1204, missingDocs: 987, expiredLicences: 45 },
    buckets: { ...zeroBuckets, todays_active: 9999, needs_driver_action: 12345, needs_admin_review: 1203, blocked_evidence: 345, ready_to_close: 858, ready_to_invoice: 99999, completed_not_invoiced: 123456, cancelled_archived: 4100 },
    attention: { exceptions: [{ ...exceptionsBusy[0], title: "Delivery inspection photos failed to upload after three retries on a weak mobile connection" }] },
  },
  loading: null,
};

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const fx = fixtures[fixture];
if (fx) {
  // Far-future updatedAt: the seeded data is never stale, so hooks never refetch.
  const opts = { updatedAt: now + 1e10 };
  const filters = { severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "" };
  client.setQueryData(["jobs", "admin", "queues"], fx.queues, opts);
  client.setQueryData(["jobs", "admin", "queue-kpis"], fx.kpis, opts);
  client.setQueryData(["admin-missing-evidence-count"], fx.evidence, opts);
  client.setQueryData(["admin-compliance-counts"], fx.compliance, opts);
  client.setQueryData(["admin-operations-buckets"], fx.buckets, opts);
  client.setQueryData(["attention-center", "org", filters], fx.attention, opts);
} else {
  // Loading fixture: queries that never resolve, so every skeleton stays visible.
  client.setDefaultOptions({ queries: { queryFn: () => new Promise(() => {}), retry: false } });
}

function Landed() {
  const loc = useLocation();
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <p data-testid="landed">{loc.pathname + loc.search}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <AuthProvider overrideRoles={role === "SUPERADMIN" ? ["SUPERADMIN", "ADMIN", "DRIVER"] : ["ADMIN", "DRIVER"]}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="*" element={<Landed />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
