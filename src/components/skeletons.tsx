import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared content-shaped loading placeholders. These replace bare full-screen
 * spinners for the INITIAL blocking load only — background refetches must
 * keep real content on screen. All skeletons are aria-hidden: assistive
 * technology should hear the page's loading state, not a grid of pulsing
 * boxes.
 */

/** Avatar + two-line rows, shaped like the job/driver/expense list cards. */
export function ListRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="w-7 h-7 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Compact stat-pill row, shaped like KpiPill / AttentionKpis strips. */
export function KpiRowSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${items}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: items }, (_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-2.5"
        >
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Label + input pairs, shaped like the job/expense edit forms. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-5 p-4" aria-hidden="true">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}

/** Heading + card sections, shaped like report/detail screens. */
export function DetailSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="space-y-4 p-4" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      {Array.from({ length: sections }, (_, i) => (
        <div
          key={i}
          className="rounded-xl bg-card border border-border p-4 space-y-3"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}
