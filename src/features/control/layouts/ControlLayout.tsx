import { Outlet } from "react-router-dom";
import { ControlSidebar } from "../components/ControlSidebar";
import { ControlTopbar } from "../components/ControlTopbar";

/**
 * Desktop-first shell layout for the Command Center.
 * Uses <Outlet/> to render nested /control/* pages.
 */
export function ControlLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <ControlSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <ControlTopbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
