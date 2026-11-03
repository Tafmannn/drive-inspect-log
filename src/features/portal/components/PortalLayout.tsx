import { NavLink, Outlet } from "react-router-dom";
import { Loader2, LogOut, Mail, Phone, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePortalContext } from "../api";

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** Only an https image URL is used for the operator's logo; anything else falls back to Axentra's. */
function safeLogo(url: string | null | undefined): string {
  if (!url) return "/axentra-logo.png";
  try {
    return new URL(url).protocol === "https:" ? url : "/axentra-logo.png";
  } catch {
    return "/axentra-logo.png";
  }
}

export function PortalLayout() {
  const { logout, user } = useAuth();
  const { data: ctx, isLoading, error } = usePortalContext();

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

  const accent = ctx.operator.primary_colour && HEX_COLOUR.test(ctx.operator.primary_colour)
    ? ctx.operator.primary_colour
    : undefined;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className="border-b border-border bg-card"
        style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={safeLogo(ctx.operator.logo_url)}
              alt={ctx.operator.name}
              className="h-8 w-auto max-w-[140px] object-contain"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{ctx.operator.name}</p>
              <p className="text-xs text-muted-foreground truncate">Customer portal · {ctx.client.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Sign out">
            <LogOut className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 pb-2 flex gap-1" aria-label="Portal">
          <NavLink to="/portal" end className={navClass}>Vehicle moves</NavLink>
          <NavLink to="/portal/invoices" className={navClass}>Invoices</NavLink>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5">
        <Outlet />
      </main>

      <footer className="border-t border-border print:hidden">
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
