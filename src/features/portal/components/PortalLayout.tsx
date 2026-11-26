import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { CarFront, FileText, Loader2, LogOut, Mail, Phone, ShieldAlert, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePortalContext } from "../api";
import { BRAND_BANNER_SURFACE, BRAND_AVATAR_SURFACE, BRAND_ROW_LAYOUT, BrandLockup, BrandRoleBadge, BrandStatusBar } from "@/components/BrandHeader";

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/**
 * The operator's logo: an https image URL, or a path served by this app
 * (e.g. "/email/axentra-logo-email.jpg"); invalid URLs use the operator name.
 */
function safeLogo(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Axentra uses its shared lockup; other operators keep their own identity.
 */
function OperatorBrand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const axentra = /^axentra(?: vehicles?| vehicle logistics)?$/i.test(name.trim());
  if (axentra) return <span className="flex min-w-0 items-center gap-2.5"><BrandLockup /></span>;
  const logo = safeLogo(logoUrl);
  if (logo) {
    return <img src={logo} alt={name} className="h-8 w-auto max-w-[132px] object-contain sm:h-9" />;
  }
  return <span className="truncate text-[15px] font-semibold text-foreground">{name}</span>;
}

export function PortalLayout() {
  const { logout, user } = useAuth();
  const { data: ctx, isLoading, error } = usePortalContext();
  const { pathname } = useLocation();
  // A move's own page still belongs to "Vehicle moves".
  const onMoves = pathname === "/portal" || pathname.startsWith("/portal/jobs");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !ctx) {
    // Signed in as a portal user, but the server says no: suspended, the
    // client was deactivated, or the account isn't fully set up.
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Portal access unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Your customer portal access isn't active right now. Please contact your transport provider.
          </p>
          <Button variant="outline" onClick={() => void logout()}>Sign out</Button>
        </div>
      </div>
    );
  }

  const isAxentra = /^axentra(?: vehicles?| vehicle logistics)?$/i.test(ctx.operator.name.trim());
  const accent = ctx.operator.primary_colour && HEX_COLOUR.test(ctx.operator.primary_colour)
    ? ctx.operator.primary_colour
    : undefined;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4FA8] sm:flex-none",
      isActive
        ? "bg-[#1E4FA8] text-white shadow-[0_1px_2px_rgb(30_79_168/0.3)]"
        : "text-slate-700 hover:bg-white hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-card dark:hover:text-foreground",
    );

  return (
    <div className="min-h-[100dvh] bg-[#F6F8FB] flex flex-col dark:bg-background">
      <header
        className="border-b border-slate-200/70 bg-[hsl(216_33%_97%)] supports-[backdrop-filter]:backdrop-blur sticky top-0 z-30 dark:border-border dark:bg-card/95"
        style={accent && !/^axentra(?: vehicles?| vehicle logistics)?$/i.test(ctx.operator.name.trim()) ? { borderBottomColor: accent } : undefined}
      >
        <BrandStatusBar />
        <div className={isAxentra ? BRAND_BANNER_SURFACE : "bg-card"}>
        <div data-axentra-brand-row={isAxentra ? true : undefined} className={BRAND_ROW_LAYOUT}>
          <div className="flex min-w-0 items-center gap-3">
            <OperatorBrand name={ctx.operator.name} logoUrl={ctx.operator.logo_url} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
          {isAxentra ? <BrandRoleBadge>Customer Portal</BrandRoleBadge> : <span className="hidden min-[360px]:inline-flex h-6 items-center rounded-full border bg-card px-2 text-xs text-muted-foreground">Customer Portal</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors focus:outline-none focus-visible:ring-2", isAxentra ? BRAND_AVATAR_SURFACE + " focus-visible:ring-white" : "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary")}
              >
                <UserRound className="h-5 w-5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
              <DropdownMenuLabel className="space-y-0.5 font-normal">
                <span className="block truncate text-sm font-semibold">{ctx.client.name}</span>
                {user?.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void logout()} className="gap-2">
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 pb-3" aria-label="Portal">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 sm:inline-flex dark:bg-muted">
            <Link to="/portal" className={tabClass({ isActive: onMoves })} aria-current={onMoves ? "page" : undefined}>
              <CarFront className="h-4 w-4" aria-hidden /> Vehicle moves
            </Link>
            <NavLink to="/portal/invoices" className={tabClass}>
              <FileText className="h-4 w-4" aria-hidden /> Invoices
            </NavLink>
          </div>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 sm:py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200/70 bg-white pb-[env(safe-area-inset-bottom)] print:hidden dark:border-border dark:bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>Questions about a move? Contact {ctx.operator.name}</span>
          {ctx.operator.contact_email && (
            <a href={`mailto:${ctx.operator.contact_email}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Mail className="w-3.5 h-3.5" /> {ctx.operator.contact_email}
            </a>
          )}
          {ctx.operator.contact_phone && (
            <a href={`tel:${ctx.operator.contact_phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Phone className="w-3.5 h-3.5" /> {ctx.operator.contact_phone}
            </a>
          )}
          {user?.email && <span className="ml-auto">Signed in as {user.email}</span>}
        </div>
      </footer>
    </div>
  );
}
