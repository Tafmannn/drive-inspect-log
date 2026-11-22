import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/context/AuthContext";

interface AppHeaderProps {
  title?: string;
  /** One short line under the title (e.g. "Step 3 of 6 · Vehicle Damage"). */
  subtitle?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  /** Right-aligned page actions. */
  children?: React.ReactNode;
}

/**
 * Shared page chrome (UI V2 foundation).
 *
 * Phone: a compact cobalt brand bar (logo, role) and one title row with the
 * back button — no breadcrumb row, which cost a full line before any content.
 * Tablet/desktop: breadcrumbs return, above the title, where there is room.
 * Route/role behaviour is unchanged: same back handling, same role labels.
 */
export const AppHeader = ({
  title,
  subtitle,
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
      {/* Brand bar. The cobalt background extends under the iOS status bar in
          standalone mode; padding-top keeps content below the status icons.
          env() resolves to 0 in a normal browser tab. */}
      <div className="bg-[hsl(var(--brand-bar))] pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:h-14 lg:px-8">
          <button
            onClick={() => navigate("/")}
            className="-ml-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1"
            type="button"
            aria-label="Go to dashboard"
          >
            <img src="/axentra-logo.png" alt="" aria-hidden className="-my-1 h-8 w-auto brightness-0 invert lg:h-9" />
            <span className="truncate text-[15px] font-semibold tracking-[0.14em] lg:text-base">AXENTRA</span>
          </button>
          <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-white/15 px-2.5 text-xs font-medium text-white ring-1 ring-inset ring-white/25">
            {roleLabel}
          </span>
        </div>
      </div>
      {/* Page header: title row (+ breadcrumbs from md up). min-w-0 lets long
          job references truncate instead of widening the layout viewport. */}
      <header className="border-b border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="hidden pt-2 md:block">
            <Breadcrumbs compact />
          </div>
          <div className="flex min-h-[56px] items-center justify-between gap-2 py-1.5 lg:min-h-[64px]">
            <div className="flex min-w-0 items-center gap-2.5">
              {showBack && (
                <button
                  onClick={handleBack}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_1px_2px_rgb(15_23_42/0.05)] transition-colors hover:bg-muted active:bg-muted"
                  aria-label="Go back"
                  type="button"
                >
                  <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
                </button>
              )}
              {(title || subtitle) && (
                <div className="min-w-0">
                  {title && (
                    <h1 className="truncate text-[19px] font-semibold leading-tight tracking-[-0.01em] text-foreground lg:text-2xl">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="truncate text-[13px] leading-snug text-muted-foreground lg:text-sm">{subtitle}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">{children}</div>
          </div>
        </div>
      </header>
    </div>
  );
};
