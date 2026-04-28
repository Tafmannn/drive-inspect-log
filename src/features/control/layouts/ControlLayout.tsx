import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { ControlSidebar } from "../components/ControlSidebar";
import { ControlTopbar } from "../components/ControlTopbar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Mobile-first shell for the Command Center.
 *  - <lg: sidebar hidden, opens as off-canvas drawer via hamburger
 *  - lg+: persistent sidebar
 */
export function ControlLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop / tablet sidebar */}
      <div className="hidden lg:flex">
        <ControlSidebar />
      </div>

      {/* Mobile drawer sidebar */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 w-[280px] max-w-[85vw]">
          <div onClick={() => setDrawerOpen(false)}>
            <ControlSidebar />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col min-w-0">
        <ControlTopbar
          leading={
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 lg:hidden -ml-2"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          }
        />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
