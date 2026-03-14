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
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Admin", path: "/control/admin", icon: "Settings" },
    ],
  },
  {
    label: "Super Admin",
    requiredRoles: ["SUPERADMIN"],
    items: [
      { label: "Super Admin", path: "/control/super-admin", icon: "Crown" },
    ],
  },
];
