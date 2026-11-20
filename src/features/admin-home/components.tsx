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
        size === "md" ? "h-10 w-10 rounded-[12px]" : "h-8 w-8 rounded-[10px]",
        ICON_TONE[tone],
      )}
    >
      <Icon className={size === "md" ? "h-5 w-5" : "h-4 w-4"} strokeWidth={1.85} />
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
    <div className="flex items-center justify-between gap-3 px-4 pb-1.5 pt-3 sm:px-5 sm:pt-3.5">
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-[17px] font-semibold leading-[22px] tracking-[-0.016em] text-foreground">
        {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
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

/** Exact below a million; compact above (the exact value stays in aria-label). */
function kpiFigure(value: number): string {
  if (value >= 1_000_000) {
    return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return value.toLocaleString("en-GB");
}

/**
 * Compact KPI tile: the value leads at full tile width (never truncated),
 * with a small tinted icon beside the label. ~84 px tall on phones.
 */
export function KpiTile({
  label, value, icon: Icon, tone, attention, loading, onClick,
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
  const figure = kpiFigure(value);
  const size = figure.length <= 4 ? "text-[28px]" : figure.length <= 6 ? "text-[24px]" : "text-[21px]";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${loading ? "loading" : value.toLocaleString("en-GB")}`}
      className={cn(
        "ah-card ah-press ah-lift group flex min-h-[84px] min-w-0 flex-col justify-between gap-1.5 rounded-[18px] px-3.5 pb-3 pt-2.5 text-left sm:px-4",
        active && attention && TILE_TINT[tone],
      )}
    >
      {loading ? (
        <Skeleton className="mt-1 h-7 w-10 rounded-md" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "ah-num ah-figure block whitespace-nowrap font-semibold leading-8 tracking-[-0.025em]",
            active ? "text-foreground" : "text-foreground/45",
            size,
          )}
        >
          {figure}
        </span>
      )}
      <span aria-hidden className="flex items-start gap-1.5">
        <span className={cn("mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px]", ICON_TONE[active ? tone : "neutral"])}>
          <Icon className="h-3 w-3" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-[18px] text-[hsl(var(--ah-ink-soft))]">{label}</span>
      </span>
    </button>
  );
}

/* ── Attention banner ────────────────────────────────────────────── */

export function AttentionBanner({
  title, message, actionLabel, onAction, icon: Icon,
}: {
  title: string;
  /** A sentence, or a list of short parts shown as "a · b · c" that never break mid-part. */
  message: string | string[];
  actionLabel: string;
  onAction: () => void;
  icon: LucideIcon;
}) {
  return (
    <section aria-label={title} className="ah-banner px-4 pb-3.5 pt-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.14] ring-1 ring-inset ring-white/20">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <h2 className="min-w-0 flex-1 text-[16px] font-semibold leading-[21px] tracking-[-0.012em]">{title}</h2>
        <button
          type="button"
          onClick={onAction}
          className="ah-press -mr-1.5 inline-flex min-h-11 shrink-0 items-center px-1.5 focus-visible:outline-white"
        >
          <span className="inline-flex h-8 items-center gap-0.5 rounded-full bg-white pl-3.5 pr-2.5 text-[14px] font-semibold text-[hsl(var(--ah-navy))] shadow-[0_1px_2px_rgb(0_0_0/0.14)]">
            {actionLabel}
            <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={2.25} />
          </span>
        </button>
      </div>
      <p className="mt-0.5 pl-11 text-[14px] leading-[19px] text-white/[0.82]">
        {Array.isArray(message)
          ? message.map((part, i) => (
              <span key={part}>
                <span className="whitespace-nowrap">
                  {part}
                  {i < message.length - 1 && <span aria-hidden className="pl-1 text-white/50">·</span>}
                </span>
                {i < message.length - 1 && " "}
              </span>
            ))
          : message}
      </p>
    </section>
  );
}

/** Quiet notice card for the non-urgent banner states (clear, or data unavailable). */
export function NoticeCard({
  title, message, icon, tone, action,
}: {
  title: string;
  message: string;
  icon: LucideIcon;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section aria-label={title} className="ah-card flex items-center gap-3 px-4 py-3">
      <IconSquare icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold leading-5 tracking-[-0.01em] text-foreground">{title}</h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{message}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-[15px] font-medium text-primary transition-opacity active:opacity-60"
        >
          {action.label}
        </button>
      )}
    </section>
  );
}

export function BannerSkeleton() {
  return <Skeleton aria-label="Loading" className="h-[76px] w-full rounded-[20px]" />;
}

/* ── Queue strip ─────────────────────────────────────────────────── */

export interface QueueStat {
  key: string;
  label: string;
  value: number;
  /** Colour the value when non-zero (only for problem queues). */
  tone?: "danger";
  onClick?: () => void;
}

/**
 * Side-by-side queue counts separated by hairlines. Deliberately no
 * connectors or arrows: these are independent queues, not a sequence
 * every job passes through.
 */
export function QueueStrip({ stats, loading }: { stats: QueueStat[]; loading?: boolean }) {
  // One size for the whole row, chosen by the longest figure, so values align.
  const longest = Math.max(...stats.map((x) => x.value.toLocaleString("en-GB").length));
  const figureSize = longest <= 4 ? "text-[22px]" : "text-[18px]";
  return (
    <ul
      className="grid divide-x divide-[hsl(var(--ah-hairline))] px-1.5 pb-2.5 sm:px-2.5"
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((s) => {
        const active = !loading && s.value > 0;
        return (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              onClick={s.onClick}
              disabled={!s.onClick}
              aria-label={`${s.label}: ${loading ? "loading" : s.value.toLocaleString("en-GB")}`}
              className="ah-row flex min-h-[64px] w-full flex-col items-start justify-start rounded-xl px-2.5 py-1.5 text-left disabled:cursor-default"
            >
              {loading ? (
                <Skeleton className="h-6 w-8 rounded" />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "ah-num ah-figure block whitespace-nowrap font-semibold leading-7 tracking-[-0.02em]",
                    figureSize,
                    active && s.tone === "danger" ? "text-destructive" : active ? "text-foreground" : "text-foreground/45",
                  )}
                >
                  {s.value.toLocaleString("en-GB")}
                </span>
              )}
              <span aria-hidden className="text-[13px] font-medium leading-[17px] text-[hsl(var(--ah-ink-soft))]">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ── List rows (Operations, Compliance, Management) ─────────────── */

export function CountRow({
  icon, label, value, valueText, tone, loading, onClick, hint,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  /** Shown instead of a number when no trustworthy count exists (e.g. "—"). */
  valueText?: string;
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
      {valueText !== undefined && (
        <span className="shrink-0 text-[16px] font-semibold leading-5 text-muted-foreground">{valueText}</span>
      )}
      {valueText === undefined && value !== undefined &&
        (loading ? (
          <Skeleton className="h-5 w-7 rounded" />
        ) : (
          <span
            className={cn(
              "ah-num ah-figure shrink-0 text-[15px] font-semibold leading-5",
              active && tone === "danger" ? "text-destructive" : active && tone === "warning" ? "text-warning" : active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {value.toLocaleString("en-GB")}
          </span>
        ))}
      {onClick && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={2} />}
    </>
  );
  const cls = "flex w-full min-h-[52px] items-center gap-3 px-4 py-2 text-left sm:px-5";
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
  return <p className="px-4 pb-4 pt-0.5 text-[14px] leading-5 text-muted-foreground sm:px-5">{children}</p>;
}
