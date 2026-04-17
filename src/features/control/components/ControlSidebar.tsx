import { useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useControlNavigation } from "../hooks/useControlNavigation";
import { useControlAccess } from "../hooks/useControlAccess";
import {
  LayoutDashboard,
  Truck,
  Users,
  ShieldCheck,
  PoundSterling,
  Settings,
  Crown,
  Building2,
  FileText,
  FileDown,
  ClipboardCheck,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Truck,
  Users,
  ShieldCheck,
  PoundSterling,
  Settings,
  Crown,
  Building2,
  FileText,
  FileDown,
  ClipboardCheck,
};

export function ControlSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = useControlNavigation();
  const { userName, userEmail } = useControlAccess();
  const { logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/control"
      ? location.pathname === "/control"
      : location.pathname.startsWith(path);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r bg-sidebar shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border shrink-0">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary-foreground">AX</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="text-sm font-semibold text-sidebar-foreground block truncate">
              Axentra
            </span>
            <span className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">
              Command Center
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <span className="px-2 mb-1 block text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest">
                {group.label}
              </span>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
                const active = isActive(item.path);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-2 py-2 space-y-1 shrink-0">
        {/* Back to mobile app link */}
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          title={collapsed ? "Back to App" : undefined}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0 rotate-180" />
          {!collapsed && <span>Back to App</span>}
        </Link>

        {/* User */}
        {!collapsed && (
          <div className="px-2.5 py-1.5">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{userName}</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">{userEmail}</p>
          </div>
        )}

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground mx-auto"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
