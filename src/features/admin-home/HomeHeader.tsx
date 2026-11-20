/**
 * Admin Home header: brand mark + product name, role, and profile shortcut.
 *
 * Replaces AppHeader on the admin/super-admin home only. Keeps AppHeader's
 * behaviour: the brand button returns to "/", the role label is shown.
 * On "/" AppHeader's breadcrumb trail renders nothing, so nothing is lost.
 *
 * Logo: the original lockup (/axentra-logo-lockup.webp) is stacked (mark over
 * wordmark). The mark is shown by cropping that file with CSS: the asset is
 * not modified or redrawn. Mark bounds in the 700×474 source: x 114–564,
 * y 15–251 (measured from the alpha channel).
 */
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const SRC_W = 700;
const SRC_H = 474;
const MARK = { x: 114, y: 15, w: 450, h: 236 };
const MARK_HEIGHT = 26; // CSS px
const k = MARK_HEIGHT / MARK.h;

export function HomeHeader() {
  const navigate = useNavigate();
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const roleLabel = isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Driver App";
  const initial = (user?.name?.trim()[0] ?? "A").toUpperCase();

  return (
    <header>
      {/* Only visible in the installed PWA (env() is 0 in a browser tab). */}
      <div aria-hidden className="ah-statusbar" />
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-1.5 sm:px-6 sm:pt-3 lg:px-8">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Go to dashboard"
          className="-ml-1.5 flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-1.5"
        >
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
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden h-6 items-center rounded-full border border-[hsl(var(--ah-line))] bg-card px-2 text-[12px] font-medium text-muted-foreground min-[360px]:inline-flex">
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            aria-label={`Profile${user?.name ? ` — ${user.name}` : ""}`}
            className="ah-press -mr-1 flex h-11 w-11 items-center justify-center rounded-full"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_1px_2px_hsl(var(--ah-shadow)/0.15),0_4px_10px_-4px_hsl(var(--primary)/0.55)]"
            >
              {initial}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
