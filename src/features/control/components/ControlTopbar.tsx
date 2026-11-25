import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandHeader } from "@/components/BrandHeader";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
      <BrandHeader className="bg-[hsl(216_33%_97%)] dark:bg-background" rowClassName="max-w-none pb-1" profile={
        <button type="button" onClick={() => navigate("/profile")} aria-label="Profile"
          className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <UserAvatar photoPath={ownPhotoPath} name={userName} className="h-9 w-9 bg-primary text-primary-foreground shadow-sm [&>span]:bg-primary [&>span]:text-primary-foreground" />
        </button>
      } />
      <header className="min-h-14 shrink-0 border-b bg-card flex items-center justify-between px-4 lg:px-6 gap-2 lg:gap-4">
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
            <kbd className="ml-auto text-caption border rounded px-1 py-0.5 text-muted-foreground">
              ⌘K
            </kbd>
          </Button>

          {/* Notifications */}
          <NotificationsPopover />

        </div>
      </header>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
