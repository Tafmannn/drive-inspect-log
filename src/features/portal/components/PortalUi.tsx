/**
 * Customer portal V3 building blocks: the compact branded introduction,
 * metric cards, segmented tabs and the empty / error / loading states.
 * Presentation only — every number shown comes from the caller.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Card surface shared by every portal panel. */
export const portalCard =
  "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04),0_4px_16px_-8px_rgb(15_23_42/0.08)] dark:border-border dark:bg-card";

/* ── Compact branded introduction ─────────────────────────────────────── */

export function PortalHero({ eyebrow, title, subtitle }: { eyebrow?: string | null; title: string; subtitle: string }) {
  return (
    <section
      aria-labelledby="portal-hero-title"
      className="relative isolate overflow-hidden rounded-2xl bg-[#08152E] px-5 py-4 text-white sm:px-7 sm:py-6"
    >
      {/* CSS-only light treatment: a cobalt glow and two soft "headlight"
          streaks on the right. Decorative; kept behind the text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(30_79_168/0.55),transparent_60%),linear-gradient(135deg,#061026_0%,#0b1d42_55%,#0f2a5c_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-1/2 -z-10 hidden h-24 w-64 -translate-y-1/2 -rotate-[8deg] opacity-70 min-[400px]:block sm:w-96"
      >
        <span className="absolute inset-x-0 top-[38%] h-px bg-gradient-to-l from-transparent via-sky-200/80 to-transparent blur-[0.5px]" />
        <span className="absolute inset-x-8 top-[52%] h-[2px] bg-gradient-to-l from-transparent via-white/70 to-transparent blur-[1px]" />
        <span className="absolute inset-x-16 top-[64%] h-px bg-gradient-to-l from-transparent via-sky-300/50 to-transparent" />
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-[3px] w-6 rounded-full bg-[#3B82F6]" />
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">{eyebrow || "Customer portal"}</p>
      </div>
      <h1 id="portal-hero-title" className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-1 max-w-[34ch] text-[13px] leading-snug text-slate-300 sm:max-w-none sm:text-sm">{subtitle}</p>
    </section>
  );
}

/* ── Metric cards ─────────────────────────────────────────────────────── */

const TONE = {
  blue: { chip: "bg-blue-50 text-[#1E4FA8] dark:bg-primary/15 dark:text-primary", ring: "" },
  green: { chip: "bg-emerald-50 text-emerald-700 dark:bg-success/15 dark:text-success", ring: "" },
  violet: { chip: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", ring: "" },
  red: { chip: "bg-red-50 text-red-700 dark:bg-destructive/15 dark:text-destructive", ring: "border-red-200 dark:border-destructive/40" },
} as const;
export type MetricTone = keyof typeof TONE;

/**
 * One figure. `state` keeps "still loading" and "couldn't load" distinct
 * from a real zero: neither ever shows a number.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  to,
  state = "ready",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: MetricTone;
  to?: string;
  state?: "ready" | "loading" | "error";
  className?: string;
}) {
  const body = (
    <div className={cn(portalCard, "flex h-full items-start gap-3 p-3.5 sm:p-4", TONE[tone].ring, to && "transition-colors hover:border-[#1E4FA8]/40")}>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight text-slate-600 dark:text-muted-foreground">{label}</p>
        {state === "loading" ? (
          <p className="mt-1.5 h-7 w-16 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none dark:bg-muted" aria-label={`${label}: loading`} />
        ) : (
          <p className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-slate-900 dark:text-foreground">
            {state === "error" ? "—" : value}
          </p>
        )}
        {state !== "loading" && (hint || state === "error") && (
          <p className={cn("mt-1.5 text-xs leading-snug", tone === "red" ? "text-red-700 dark:text-destructive" : "text-slate-500 dark:text-muted-foreground")}>
            {state === "error" ? "Couldn't load right now" : hint}
          </p>
        )}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className={cn("block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4FA8] focus-visible:ring-offset-2", className)}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/* ── Segmented tabs ───────────────────────────────────────────────────── */

export function SegmentedTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex rounded-xl bg-slate-100 p-1 dark:bg-muted", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4FA8]",
              active
                ? "bg-white text-[#1E4FA8] shadow-[0_1px_2px_rgb(15_23_42/0.08),0_1px_6px_-2px_rgb(15_23_42/0.1)] dark:bg-card dark:text-primary"
                : "text-slate-600 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-[11px] font-semibold leading-5 tabular-nums",
                  active ? "bg-blue-50 text-[#1E4FA8] dark:bg-primary/15 dark:text-primary" : "bg-slate-200/70 text-slate-600 dark:bg-background dark:text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Empty / error / loading ──────────────────────────────────────────── */

export function EmptyState({
  art,
  title,
  body,
  action,
}: {
  art?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn(portalCard, "relative overflow-hidden px-6 py-8 text-center sm:py-10")}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-50/60 to-transparent dark:from-primary/5" />
      {art && <div className="relative mx-auto mb-4 flex justify-center">{art}</div>}
      <p className="relative text-base font-semibold text-slate-900 dark:text-foreground">{title}</p>
      {body && <p className="relative mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-muted-foreground">{body}</p>}
      {action && <div className="relative mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={cn(portalCard, "flex flex-col items-center gap-3 px-6 py-8 text-center")}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-destructive/15 dark:text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-slate-900 dark:text-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="mr-1.5 h-4 w-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function CardListSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn(portalCard, "space-y-3 p-4")}>
          <div className="flex justify-between gap-3">
            <div className="h-5 w-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none dark:bg-muted" />
          </div>
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Understated car-transporter line drawing for the empty moves list. */
export function TransporterArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 92" className={cn("h-[72px] w-auto", className)} aria-hidden focusable="false">
      <ellipse cx="100" cy="84" rx="86" ry="5" fill="#E8EEF8" />
      {/* cab */}
      <path d="M150 44h18l12 14v16h-30z" fill="#fff" stroke="#9FB3D1" strokeWidth="2" strokeLinejoin="round" />
      <path d="M155 49h11l8 9h-19z" fill="#DCE8FB" />
      <rect x="150" y="62" width="30" height="5" rx="1.5" fill="#1E4FA8" opacity=".85" />
      {/* deck */}
      <rect x="22" y="62" width="128" height="7" rx="2" fill="#5B6E8C" />
      <path d="M22 69h128" stroke="#3F516E" strokeWidth="2" />
      {/* car on deck */}
      <path
        d="M44 60c0-5 3-8 8-9l10-8c3-2 6-3 10-3h26c4 0 7 1 10 4l8 7c6 1 10 4 10 9z"
        fill="#fff"
        stroke="#9FB3D1"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M64 50l7-6c2-1 4-2 6-2h10v8zM91 42h8c3 0 5 1 7 3l5 5H91z" fill="#DCE8FB" />
      <circle cx="60" cy="61" r="5" fill="#3F516E" />
      <circle cx="104" cy="61" r="5" fill="#3F516E" />
      {/* wheels */}
      {[42, 58, 132, 166].map((x) => (
        <g key={x}>
          <circle cx={x} cy="75" r="7" fill="#3F516E" />
          <circle cx={x} cy="75" r="2.6" fill="#C9D5E8" />
        </g>
      ))}
    </svg>
  );
}
