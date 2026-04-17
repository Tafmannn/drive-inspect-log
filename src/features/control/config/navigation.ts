import type { NavGroup } from "../types";

export const CONTROL_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Command Center", path: "/control", icon: "LayoutDashboard" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Jobs", path: "/control/jobs", icon: "Truck" },
      { label: "POD Review", path: "/control/pod-review", icon: "ClipboardCheck" },
    ],
  },
  {
    label: "Fleet & Drivers",
    items: [
      { label: "Drivers", path: "/control/drivers", icon: "Users" },
    ],
  },
  {
    label: "Compliance & Audit",
    items: [
      { label: "Compliance", path: "/control/compliance", icon: "ShieldCheck" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Finance", path: "/control/finance", icon: "PoundSterling" },
      { label: "Clients", path: "/control/clients", icon: "Building2" },
      { label: "Invoice Prep", path: "/control/invoice-prep", icon: "FileText" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Admin", path: "/control/admin", icon: "Settings" },
      { label: "Exports", path: "/control/exports", icon: "FileDown" },
    ],
  },
  {
    label: "Platform",
    requiredRoles: ["SUPERADMIN"],
    items: [
      { label: "Super Admin", path: "/control/super-admin", icon: "Crown" },
    ],
  },
];
