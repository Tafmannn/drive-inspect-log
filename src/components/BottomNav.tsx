import { Home, Briefcase, Upload, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: Briefcase, label: "Jobs", path: "/jobs" },
  { icon: Upload, label: "Uploads", path: "/pending-uploads" },
  { icon: User, label: "Profile", path: "/profile" },
] as const;

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
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
            <span className="text-[12px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
};
