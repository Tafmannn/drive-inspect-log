import type { AppRole } from "@/context/AuthContext";

/* ── Navigation ─────────────────────────────────────── */

export interface NavItem {
  label: string;
  path: string;
  icon: string; // lucide icon name
  /** Roles that may see this item. Empty = all authenticated. */
  requiredRoles?: AppRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** If set, only users with one of these roles see the group */
  requiredRoles?: AppRole[];
}

/* ── Page context ───────────────────────────────────── */

export interface ControlPageMeta {
  title: string;
  subtitle?: string;
}
