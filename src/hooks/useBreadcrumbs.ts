import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

export interface Crumb {
  label: string;
  path?: string; // undefined = current page (no link)
}

/**
 * Static route → label mapping.
 * Dynamic segments (e.g. :jobId) are handled separately.
 */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/jobs": "Jobs",
  "/jobs/new": "New Job",
  "/jobs/master": "Master List",
  "/jobs/completed": "Completed",
  "/jobs/pending": "Pending",
  "/expenses": "Expenses",
  "/expenses/new": "New Expense",
  "/pending-uploads": "Pending Uploads",
  "/profile": "Profile",
  // Admin
  "/admin": "Admin",
  "/admin/jobs": "Jobs Queue",
  "/admin/timesheets": "Timesheets",
  "/admin/sync-errors": "Sync Errors",
  "/admin/users": "Users",
  "/admin/drivers": "Drivers",
  "/admin/pod-review": "POD Review",
  "/admin/finance": "Finance",
  // Super Admin
  "/super-admin": "Super Admin",
  "/super-admin/orgs": "Organisations",
  "/super-admin/users": "Users",
  "/super-admin/jobs": "Jobs",
  "/super-admin/audit": "Audit",
  "/super-admin/errors": "Errors",
  "/super-admin/attention": "Attention",
  "/super-admin/settings": "Settings",
  // Control Center
  "/control": "Command Center",
  "/control/jobs": "Jobs",
  "/control/pod-review": "POD Review",
  "/control/drivers": "Drivers",
  "/control/compliance": "Compliance",
  "/control/finance": "Finance",
  "/control/admin": "Admin",
  "/control/super-admin": "Super Admin",
  // Misc
  "/invoice/new": "New Invoice",
};

/** Parent path for a given route prefix */
const PARENT_MAP: Record<string, string> = {
  "/jobs": "/",
  "/expenses": "/",
  "/pending-uploads": "/",
  "/profile": "/",
  "/admin": "/",
  "/super-admin": "/",
  "/control": "/control",
  "/invoice": "/admin",
};

function getParentPath(pathname: string): string | null {
  // Try exact match first, then prefix
  if (PARENT_MAP[pathname]) return PARENT_MAP[pathname];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  // Walk up one level
  const parent = "/" + segments.slice(0, -1).join("/");
  return parent;
}

export function useBreadcrumbs(): Crumb[] {
  const location = useLocation();
  const params = useParams();
  const pathname = location.pathname;

  return useMemo(() => {
    const crumbs: Crumb[] = [];
    const segments = pathname.split("/").filter(Boolean);

    // Build cumulative paths
    let accumulated = "";
    for (let i = 0; i < segments.length; i++) {
      accumulated += "/" + segments[i];
      const isLast = i === segments.length - 1;

      // Check if this is a known route
      let label = ROUTE_LABELS[accumulated];

      if (!label) {
        // Dynamic segment — try to identify it
        if (segments[i - 1] === "jobs" && !["new", "completed", "pending", "master"].includes(segments[i])) {
          // Job ID segment
          label = params.jobId ? `Job` : segments[i].slice(0, 8);
        } else if (segments[i] === "edit") {
          label = "Edit";
        } else if (segments[i] === "pod") {
          label = "POD Report";
        } else if (segments[i - 1] === "expenses" && segments[i] !== "new") {
          label = "Expense";
        } else if (segments[i - 1] === "inspection") {
          label = "Inspection";
        } else if (segments[i - 1] === "invoice" && segments[i] !== "new") {
          label = "Invoice";
        } else if (segments[i - 1] === "drivers" && /^[0-9a-f-]{20,}$/i.test(segments[i])) {
          label = "Driver";
        } else if (segments[i - 1] === "users" && /^[0-9a-f-]{20,}$/i.test(segments[i])) {
          label = "User";
        } else if (segments[i - 1] === "orgs" && /^[0-9a-f-]{20,}$/i.test(segments[i])) {
          label = "Organisation";
        } else if (segments[i - 1] === "clients" && /^[0-9a-f-]{20,}$/i.test(segments[i])) {
          label = "Client";
        } else if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(segments[i]) || /^[0-9a-f]{32}$/i.test(segments[i])) {
          // Generic UUID fallback — never display raw UUIDs to users
          label = "Detail";
        } else {
          // Capitalize as fallback
          label = segments[i].charAt(0).toUpperCase() + segments[i].slice(1).replace(/-/g, " ");
        }
      }

      crumbs.push({
        label,
        path: isLast ? undefined : accumulated,
      });
    }

    // Always prepend Dashboard unless we're on /
    if (pathname !== "/") {
      const root = segments[0];
      const rootLabel =
        root === "control" ? "Command Center" :
        root === "admin" ? "Admin" :
        root === "super-admin" ? "Super Admin" :
        "Dashboard";
      // Only add if the first crumb isn't already this root
      if (crumbs[0]?.label !== rootLabel) {
        crumbs.unshift({ label: "Dashboard", path: "/" });
      } else {
        // Ensure root has a link
        crumbs[0].path = "/" + root;
        crumbs.unshift({ label: "Dashboard", path: "/" });
      }
    }

    return crumbs;
  }, [pathname, params.jobId]);
}
