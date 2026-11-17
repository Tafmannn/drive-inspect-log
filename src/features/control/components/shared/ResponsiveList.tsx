/**
 * One list, two layouts: a dense table on desktop, touch-friendly cards on
 * phones and tablets. Used by the merged Control screens so a page keeps every
 * feature at every size instead of having a separate mobile copy.
 */
import { Fragment, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CompactTable, type CompactColumn } from "./CompactTable";
import { useIsDesktop } from "../../hooks/useIsDesktop";

interface ResponsiveListProps<T extends { id: string }> {
  rows: T[];
  columns: CompactColumn<T>[];
  renderCard: (row: T) => ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Extra classes for the card list (e.g. a two-column grid on tablets). */
  cardListClassName?: string;
}

export function ResponsiveList<T extends { id: string }>({
  rows,
  columns,
  renderCard,
  loading,
  emptyMessage,
  onRowClick,
  cardListClassName,
}: ResponsiveListProps<T>) {
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <CompactTable columns={columns} data={rows} loading={loading} emptyMessage={emptyMessage} onRowClick={onRowClick} />
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 p-3" role="status" aria-label="Loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage ?? "Nothing to show."}</p>;
  }

  return (
    <div className={cn("grid gap-2 p-2 sm:p-3 sm:grid-cols-2", cardListClassName)}>
      {rows.map((row) => (
        <Fragment key={row.id}>{renderCard(row)}</Fragment>
      ))}
    </div>
  );
}
