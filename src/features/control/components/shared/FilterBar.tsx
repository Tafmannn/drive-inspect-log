import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2.5 mb-4",
        className
      )}
    >
      {children}
    </div>
  );
}
