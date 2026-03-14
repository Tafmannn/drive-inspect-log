import { Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useControlAccess } from "../hooks/useControlAccess";

export function ControlTopbar({
  title,
  actions,
}: {
  title?: string;
  actions?: React.ReactNode;
}) {
  const { userName } = useControlAccess();

  return (
    <header className="h-14 shrink-0 border-b bg-card flex items-center justify-between px-6 gap-4">
      {/* Left: breadcrumb / title */}
      <div className="flex items-center gap-3 min-w-0">
        {title && (
          <span className="text-sm font-medium text-foreground truncate">{title}</span>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        {actions}

        {/* Global search placeholder */}
        <Button
          variant="outline"
          size="sm"
          className="hidden lg:flex items-center gap-2 text-muted-foreground font-normal w-56 justify-start"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Search…</span>
          <kbd className="ml-auto text-[10px] border rounded px-1 py-0.5 text-muted-foreground/60">
            ⌘K
          </kbd>
        </Button>

        {/* Notifications placeholder */}
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4 text-muted-foreground" />
        </Button>

        {/* Avatar */}
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
          {userName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
