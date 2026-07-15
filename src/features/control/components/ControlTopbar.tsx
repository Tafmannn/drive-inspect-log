import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useControlAccess } from "../hooks/useControlAccess";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPopover } from "./NotificationsPopover";
import { UserAvatar } from "@/components/UserAvatar";
import { useOwnProfilePhotoPath } from "@/hooks/useProfilePhoto";

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
  const { data: ownPhotoPath } = useOwnProfilePhotoPath();
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
      {/* min-h + safe-area padding (not a fixed h-14): in standalone/home-
          screen mode, page content now paints under the iOS status bar
          (viewport-fit=cover), so without this the menu/search/notification/
          avatar icons sit directly under the clock/signal/battery icons. The
          bg-card fill still extends to the true top edge; only the content
          drops below the status bar. env() is 0 in a normal browser tab, so
          this is a no-op there — matches the same fix already applied to
          AppHeader (the driver-facing equivalent of this bar). */}
      <header className="min-h-14 shrink-0 border-b bg-card flex items-center justify-between px-4 lg:px-6 gap-2 lg:gap-4 pt-[env(safe-area-inset-top)]">
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
          <UserAvatar photoPath={ownPhotoPath} name={userName} />
        </div>
      </header>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
