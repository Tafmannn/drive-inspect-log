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
    // App shell sized to the *visible* viewport (dvh). h-screen is 100vh, which
    // on iOS is the toolbar-collapsed height, so the shell overflowed the
    // screen and the document scrolled as well as <main> — two scrollers
    // fighting over one gesture, and the bottom of every page under Safari's
    // toolbar.
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop / tablet sidebar */}
      <div className="hidden lg:flex">
        <ControlSidebar />
      </div>

      {/* Mobile drawer sidebar */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 w-[280px] max-w-[85vw] overflow-hidden">
          <div
            className="h-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
            onClick={() => setDrawerOpen(false)}
          >
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
        {/* data-scroll-root: ScrollToTop resets/restores this element, since
            the Command Center scrolls here rather than on the window.
            overscroll-contain keeps iOS's bounce inside the content instead
            of dragging the whole shell (topbar included). */}
        <main data-scroll-root className="flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
