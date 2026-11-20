import { Home, Briefcase, Upload, User, ShieldCheck } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const driverTabs = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: Briefcase, label: "Jobs", path: "/jobs" },
  { icon: Upload, label: "Uploads", path: "/pending-uploads" },
  { icon: User, label: "Profile", path: "/profile" },
] as const;

const adminTabs = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: Briefcase, label: "Jobs", path: "/jobs" },
  { icon: ShieldCheck, label: "Control", path: "/control" },
  { icon: User, label: "Profile", path: "/profile" },
] as const;

/**
 * `variant="bar"` (default) is the full-width bar used across the app.
 * `variant="floating"` is the rounded dock used on the Admin Home only: same
 * tabs, same destinations, same role logic; only the presentation differs.
 * Pages using the floating dock reserve pb-28 (dock + its bottom margin).
 */
export const BottomNav = ({ variant = "bar" }: { variant?: "bar" | "floating" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isSuperAdmin } = useAuth();

  const tabs = isAdmin || isSuperAdmin ? adminTabs : driverTabs;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  if (variant === "floating") {
    return (
      <>
        <div aria-hidden className="h-[env(safe-area-inset-bottom)]" />
        <nav
          aria-label="Main"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
        >
          <div className="ah-dock pointer-events-auto mx-auto flex max-w-md items-stretch gap-1 p-1.5">
            {tabs.map(({ icon: Icon, label, path }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={cn(
                    "ah-press flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[20px] px-1",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_1px_2px_hsl(var(--ah-shadow)/0.12),0_8px_18px_-10px_hsl(var(--primary)/0.75)]"
                      : "text-muted-foreground",
                  )}
                  type="button"
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon aria-hidden className="h-[22px] w-[22px]" strokeWidth={active ? 2 : 1.75} />
                  <span className="max-w-full truncate text-[11px] font-medium leading-[13px] tracking-[0.005em]">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
    {/* Pages reserve pb-20 for this bar, but on a phone with a home indicator
        the bar is taller by env(safe-area-inset-bottom). This in-flow spacer
        adds exactly that, so the last card / action isn't hidden behind it. */}
    <div aria-hidden className="h-[env(safe-area-inset-bottom)]" />
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)] flex justify-around py-2 z-50 safe-area-bottom">
      {tabs.map(({ icon: Icon, label, path }) => {
        const active = isActive(path);
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={cn(
              "flex flex-col items-center gap-1 min-h-[44px] min-w-[44px] px-3 py-1 rounded-lg transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
            type="button"
            aria-label={label}
          >
            <Icon className="w-6 h-6 stroke-[2]" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
    </>
  );
};
