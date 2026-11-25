import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const SRC_W = 700;
const SRC_H = 474;
const MARK = { x: 114, y: 15, w: 450, h: 236 };
const MARK_HEIGHT = 26; // CSS px
const k = MARK_HEIGHT / MARK.h;

export function BrandLockup() {
  return (
    <>
      <span
            aria-hidden
            className="relative block shrink-0 overflow-hidden"
            style={{ width: MARK.w * k, height: MARK_HEIGHT }}
          >
            <img
              src="/axentra-logo-lockup.webp"
              alt=""
              decoding="async"
              draggable={false}
              className="absolute max-w-none select-none"
              style={{ width: SRC_W * k, height: SRC_H * k, left: -MARK.x * k, top: -MARK.y * k }}
            />
          </span>
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="text-[15px] font-semibold leading-[18px] tracking-[0.1em] text-foreground">AXENTRA</span>
            <span className="truncate text-[11px] font-medium leading-[14px] tracking-[0.01em] text-muted-foreground">Vehicle Logistics</span>
          </span>
    </>
  );
}

/** Identical status-bar colour on every signed-in shell; zero height in a browser tab. */
export function BrandStatusBar() {
  return <div aria-hidden className="h-[env(safe-area-inset-top,0px)] shrink-0 bg-[#0c1d41]" />;
}

export function BrandRoleBadge({ children }: { children: ReactNode }) {
  return (
    <span className="hidden h-6 shrink-0 items-center rounded-full border border-border bg-card px-2 text-[12px] font-medium text-muted-foreground min-[360px]:inline-flex">
      {children}
    </span>
  );
}

export function BrandHeader({ className, rowClassName, profile }: { className?: string; rowClassName?: string; profile?: ReactNode }) {
  const navigate = useNavigate();
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const roleLabel = isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Driver App";
  const initial = (user?.name?.trim()[0] ?? "A").toUpperCase();

  return (
    <header className={cn("shrink-0", className)}>
      <BrandStatusBar />
      <div className={cn("mx-auto flex max-w-5xl items-center justify-between gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-1.5 sm:px-6 sm:pt-3 lg:px-8", rowClassName)}>
        <button type="button" onClick={() => navigate("/")} aria-label="Go to dashboard"
          className="-ml-1.5 flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-1.5">
          <BrandLockup />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <BrandRoleBadge>{roleLabel}</BrandRoleBadge>
          {profile ?? (
            <button type="button" onClick={() => navigate("/profile")}
              aria-label={`Profile${user?.name ? ` — ${user.name}` : ""}`}
              className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full motion-safe:transition-transform motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_1px_2px_rgb(15_23_42/0.15),0_4px_10px_-4px_hsl(var(--primary)/0.55)]">{initial}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
