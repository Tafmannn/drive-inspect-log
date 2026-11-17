/**
 * The old mobile admin screens (/admin/jobs, /admin/pod-review,
 * /admin/finance, /admin/drivers) were merged into the /control screens,
 * which work on every screen size. These redirects keep old links,
 * bookmarks and installed-app shortcuts working, carrying filters across.
 */
import { Navigate, useLocation } from "react-router-dom";
import { legacyAdminJobsTarget } from "./pages/jobs/jobsView";
import { legacyAdminTarget } from "./legacyAdminTarget";

export function AdminJobsRedirect() {
  const { search } = useLocation();
  return <Navigate to={legacyAdminJobsTarget(new URLSearchParams(search))} replace />;
}

export function LegacyAdminRedirect({ area }: { area: "pod-review" | "finance" | "drivers" }) {
  const { search } = useLocation();
  return <Navigate to={legacyAdminTarget(area, new URLSearchParams(search))} replace />;
}
