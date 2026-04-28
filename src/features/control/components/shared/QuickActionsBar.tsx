import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QuickAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
}

export function QuickActionsBar({
  actions,
  className,
  sticky,
}: {
  actions: QuickAction[];
  className?: string;
  /** When true, becomes a horizontal scroll strip on mobile (sticky under topbar). */
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        sticky &&
          "lg:static sticky top-0 z-20 -mx-5 lg:mx-0 px-5 lg:px-0 py-2 lg:py-0 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b lg:border-b-0",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          sticky
            ? "overflow-x-auto lg:overflow-visible flex-nowrap lg:flex-wrap scrollbar-none [-webkit-overflow-scrolling:touch]"
            : "flex-wrap",
        )}
      >
        {actions.map((a, i) => (
          <Button
            key={i}
            size="sm"
            variant={a.variant ?? "outline"}
            onClick={a.onClick}
            disabled={a.disabled}
            className="h-9 lg:h-8 text-xs gap-1.5 shrink-0 rounded-full lg:rounded-md px-4 lg:px-3"
          >
            {a.icon && <a.icon className="h-3.5 w-3.5" />}
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
