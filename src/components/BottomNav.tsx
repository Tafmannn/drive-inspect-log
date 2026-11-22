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

    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgb(15_23_42/0.02),0_-8px_24px_-16px_rgb(15_23_42/0.18)] supports-[backdrop-filter]:bg-card/90 supports-[backdrop-filter]:backdrop-blur"
    >
      <div className="mx-auto flex max-w-xl items-stretch gap-1 px-2 pb-1.5 pt-1.5 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        {tabs.map(({ icon: Icon, label, path }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-2xl px-1 transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted",
              )}
              type="button"
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
              <span className={cn("max-w-full truncate text-[11px] leading-[13px]", active ? "font-semibold" : "font-medium")}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
};
