import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/context/AuthContext";

interface AppHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  children?: React.ReactNode;
}

export const AppHeader = ({
  title,
  showBack = false,
  onBack,
  children,
}: AppHeaderProps) => {
  const navigate = useNavigate();
  const { isSuperAdmin, isAdmin } = useAuth();
  const roleLabel = isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Driver App";

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <div className="sticky top-0 z-40">
      {/* Brand banner. The blue background extends to the true top edge (under
          the iOS status bar in standalone/home-screen mode); padding-top
          pushes the actual content below the status bar icons instead of
          being overlapped by them. env() resolves to 0 in a normal browser
          tab, so this is a no-op there. */}
      <div className="min-h-11 bg-[hsl(216,100%,40%)] flex items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2"
          type="button"
          aria-label="Go to dashboard"
        >
          <img src="/axentra-logo.png" alt="Axentra" className="h-5 w-auto brightness-0 invert" />
          <span className="text-[14px] font-semibold text-white tracking-tight">Axentra Vehicles</span>
        </button>
        <span className="text-[11px] text-white/60 font-medium">{roleLabel}</span>
      </div>
      {/* Breadcrumb trail */}
      <div className="px-4 py-1.5 border-b border-border bg-muted/50">
        <Breadcrumbs compact />
      </div>
      {/* Page header */}
      <header className="px-4 py-3 border-b border-border bg-card flex items-center justify-between min-h-[56px]">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={handleBack}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Go back"
              type="button"
            >
              <ArrowLeft className="w-6 h-6 stroke-[2]" />
            </button>
          )}
          {title && (
            <h1 className="text-[20px] font-semibold text-foreground truncate">{title}</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {children}
        </div>
      </header>
    </div>
  );
};
