import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useControlAccess } from "../hooks/useControlAccess";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPopover } from "./NotificationsPopover";

export function ControlTopbar({
  title,
  actions,
  leading,
}: {
  title?: string;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  const { userName } = useControlAccess();
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <header className="h-14 shrink-0 border-b bg-card flex items-center justify-between px-4 lg:px-6 gap-2 lg:gap-4">
        {/* Left: leading slot (mobile menu) + breadcrumb / title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {leading}
          <div className="min-w-0 hidden sm:block">
            <Breadcrumbs compact />
          </div>
          {title && (
            <span className="sm:hidden text-sm font-semibold truncate text-foreground">
              {title}
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {actions}

          {/* Global search */}
          <Button
            variant="outline"
            size="sm"
            className="hidden lg:flex items-center gap-2 text-muted-foreground font-normal w-56 justify-start"
            onClick={() => setCmdOpen(true)}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Search…</span>
            <kbd className="ml-auto text-[10px] border rounded px-1 py-0.5 text-muted-foreground/60">
              ⌘K
            </kbd>
          </Button>

          {/* Notifications */}
          <NotificationsPopover />

          {/* Avatar */}
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
