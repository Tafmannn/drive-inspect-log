/**
 * Admin Home — presentational building blocks.
 *
 * Pure UI: every component takes values and callbacks as props and owns no
 * data access. Counts, routes and conditions are supplied by the existing
 * hooks in pages/AdminDashboard.tsx; nothing here derives or reclassifies
 * business data.
 */
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import "./admin-home.css";

/* ── Tones ───────────────────────────────────────────────────────── */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Icon-square colours. Neutral when a count is zero, so calm states stay calm. */
const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-[hsl(var(--primary-soft))] text-primary",
  success: "bg-[hsl(var(--success-soft))] text-success",
  warning: "bg-[hsl(var(--warning-soft))] text-warning",
  danger: "bg-[hsl(var(--danger-soft))] text-destructive",
};

/** Whole-tile tint, used only when a tile genuinely needs attention. */
const TILE_TINT: Partial<Record<Tone, string>> = {
  warning: "bg-[hsl(var(--warning-soft)/0.45)] border-[hsl(var(--warning)/0.22)]",
  danger: "bg-[hsl(var(--danger-soft)/0.5)] border-[hsl(var(--destructive)/0.22)]",
};

export function IconSquare({ icon: Icon, tone, size = "md" }: { icon: LucideIcon; tone: Tone; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "md" ? "h-10 w-10 rounded-[12px]" : "h-9 w-9 rounded-[11px]",
        ICON_TONE[tone],
      )}
    >
      <Icon className={size === "md" ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={1.75} />
    </span>
  );
}

/* ── Section header ──────────────────────────────────────────────── */

export function SectionHeader({
  icon: Icon, title, count, countTone = "neutral", action, id,
}: {
  icon?: LucideIcon;
  title: string;
  count?: number;
  countTone?: "neutral" | "danger";
  action?: { label: string; onClick: () => void; ariaLabel?: string };
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-2.5">
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-[17px] font-semibold leading-6 tracking-[-0.012em] text-foreground">
        {Icon && <Icon aria-hidden className="h-[18px] w-[18px] shrink-0 text-foreground/70" strokeWidth={1.75} />}
        <span className="min-w-0 text-balance">{title}</span>
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              "ah-num ml-0.5 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[12px] font-semibold",
              countTone === "danger" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        )}
      </h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.ariaLabel}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full px-2 text-[15px] font-medium text-primary transition-opacity active:opacity-60"
        >
          {action.label}
          <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function Card({ children, className, as: As = "section", ...rest }: {
  children: ReactNode; className?: string; as?: "section" | "div"; "aria-labelledby"?: string;
}) {
  return <As className={cn("ah-card overflow-hidden", className)} {...rest}>{children}</As>;
}

/* ── KPI tile ────────────────────────────────────────────────────── */

export function KpiTile({
  label, value, icon, tone, attention, loading, onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Colour of the icon when the value is non-zero. */
  tone: Tone;
  /** Tint the whole tile (only for genuine attention states). */
  attention?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const active = !loading && value > 0;
  const formatted = value.toLocaleString("en-GB");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${loading ? "loading" : formatted}`}
      className={cn(
        "ah-card ah-press ah-lift group flex min-w-0 flex-col items-start p-3.5 text-left sm:p-4",
        active && attention && TILE_TINT[tone],
      )}
    >
      <IconSquare icon={icon} tone={active ? tone : "neutral"} />
      <span className="block w-full pt-3">
        {loading ? (
          <Skeleton className="h-8 w-12 rounded-md" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "ah-num block truncate font-semibold leading-none tracking-[-0.03em] text-foreground",
              formatted.length > 6 ? "text-[24px]" : "text-[30px] sm:text-[32px]",
            )}
          >
            {formatted}
          </span>
        )}
        <span aria-hidden className="mt-2 flex items-start gap-1 text-[14px] font-medium leading-[1.25] text-[hsl(var(--ah-ink-soft))]">
          <span className="min-w-0">{label}</span>
          <ChevronRight className="mt-px h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </span>
      </span>
    </button>
  );
}

/* ── Attention banner ────────────────────────────────────────────── */

export function AttentionBanner({
  title, message, actionLabel, onAction, icon: Icon,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  icon: LucideIcon;
}) {
  return (
    <section aria-label={title} className="ah-banner flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span aria-hidden className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 ring-1 ring-inset ring-white/20">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold leading-6 tracking-[-0.015em]">{title}</h2>
          <p className="mt-1 text-[15px] leading-[1.35] text-white/80">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="ah-press inline-flex min-h-11 shrink-0 items-center justify-center gap-1 self-stretch rounded-full bg-white px-5 text-[15px] font-semibold text-[hsl(var(--ah-navy))] shadow-[0_1px_2px_rgb(0_0_0/0.12)] sm:self-auto focus-visible:outline-white"
      >
        {actionLabel}
        <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </section>
  );
}

export function AllClearBanner({ title, message, icon: Icon }: { title: string; message: string; icon: LucideIcon }) {
  return (
    <section aria-label={title} className="ah-card flex items-center gap-3.5 p-4 sm:p-5">
      <IconSquare icon={Icon} tone="success" />
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.012em] text-foreground">{title}</h2>
        <p className="text-[14px] leading-5 text-muted-foreground">{message}</p>
      </div>
    </section>
  );
}

export function BannerSkeleton() {
  return <Skeleton aria-label="Loading" className="h-[92px] w-full rounded-[22px]" />;
}

/* ── Pipeline ────────────────────────────────────────────────────── */

export interface PipelineStage {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  onClick?: () => void;
}

export function Pipeline({ stages, loading }: { stages: PipelineStage[]; loading?: boolean }) {
  return (
    <ol className="relative grid px-2 pb-4 pt-1 sm:px-3" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {/* Connector runs between the first and last node centres. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-[calc(0.25rem+22px)] h-px bg-[hsl(var(--ah-line))]"
        style={{ left: `calc(${50 / stages.length}% + 0.5rem)`, right: `calc(${50 / stages.length}% + 0.5rem)` }}
      />
      {stages.map((s) => {
        const active = !loading && s.value > 0;
        const Icon = s.icon;
        return (
          <li key={s.key} className="relative min-w-0">
            <button
              type="button"
              onClick={s.onClick}
              disabled={!s.onClick}
              aria-label={`${s.label}: ${loading ? "loading" : s.value.toLocaleString("en-GB")}`}
              className="ah-row flex w-full flex-col items-center rounded-2xl px-1 pb-2 pt-1 text-center disabled:cursor-default"
            >
              <span
                aria-hidden
                className={cn(
                  "relative z-[1] inline-flex h-11 w-11 items-center justify-center rounded-full ring-4 ring-card transition-colors",
                  active ? "bg-primary text-primary-foreground" : "border border-[hsl(var(--ah-line))] bg-card text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              {loading ? (
                <Skeleton className="mt-2.5 h-6 w-8 rounded" />
              ) : (
                <span aria-hidden className="ah-num mt-2 block max-w-full truncate text-[20px] font-semibold leading-7 tracking-[-0.02em] text-foreground">
                  {s.value.toLocaleString("en-GB")}
                </span>
              )}
              <span aria-hidden className="mt-0.5 text-[13px] font-medium leading-[17px] text-[hsl(var(--ah-ink-soft))] text-balance">
                {s.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ── List rows (Operations, Compliance, Management) ─────────────── */

export function CountRow({
  icon, label, value, tone, loading, onClick, hint,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  tone: Tone;
  loading?: boolean;
  onClick?: () => void;
  hint?: string;
}) {
  const active = !loading && (value ?? 0) > 0;
  const body = (
    <>
      <IconSquare icon={icon} tone={value === undefined || active ? tone : "neutral"} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-5 text-foreground line-clamp-2">{label}</span>
        {hint && <span className="block line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">{hint}</span>}
      </span>
      {value !== undefined &&
        (loading ? (
          <Skeleton className="h-5 w-7 rounded" />
        ) : (
          <span
            className={cn(
              "ah-num shrink-0 text-[16px] font-semibold leading-5",
              active && tone === "danger" ? "text-destructive" : active && tone === "warning" ? "text-warning" : active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {value.toLocaleString("en-GB")}
          </span>
        ))}
      {onClick && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={2} />}
    </>
  );
  const cls = "flex w-full min-h-[56px] items-center gap-3 px-4 sm:px-5 py-2 text-left";
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={cn("ah-row", cls)}>
      {body}
    </button>
  );
}

/* ── Status chip (queue type or job status) ─────────────────────── */

export function Chip({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      style={style}
      className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[12px] font-semibold leading-none", className)}
    >
      {children}
    </span>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-5 pt-1 text-[14px] leading-5 text-muted-foreground sm:px-5">{children}</p>;
}
