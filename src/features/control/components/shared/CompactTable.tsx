import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export interface CompactColumn<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T, index: number) => React.ReactNode;
}

interface CompactTableProps<T> {
  columns: CompactColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  maxRows?: number;
}

export function CompactTable<T extends { id?: string }>({
  columns,
  data,
  loading,
  emptyMessage,
  onRowClick,
  className,
  maxRows,
}: CompactTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const rows = maxRows ? data.slice(0, maxRows) : data;

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        {emptyMessage ?? "No data."}
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col.key} className={cn("text-[11px] font-medium uppercase tracking-wider", col.className)}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={row.id ?? i}
              className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(col => (
                <TableCell key={col.key} className={cn("py-2", col.className)}>
                  {col.render(row, i)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
