import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function QueuePanel({
  children,
  className,
  loading,
  emptyMessage,
  isEmpty,
}: {
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
  emptyMessage?: string;
  isEmpty?: boolean;
}) {
  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">{emptyMessage ?? "Nothing to show."}</p>
      </div>
    );
  }

  return <div className={cn(className)}>{children}</div>;
}
