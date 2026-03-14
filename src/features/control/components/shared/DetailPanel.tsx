import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Right-side inspector panel.
 * Rendered inside ControlLayout's inspector slot.
 */
export function DetailPanel({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <aside
      className={cn(
        "w-[380px] shrink-0 border-l bg-card overflow-y-auto",
        className
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title ?? "Details"}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}
