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
}: {
  actions: QuickAction[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {actions.map((a, i) => (
        <Button
          key={i}
          size="sm"
          variant={a.variant ?? "outline"}
          onClick={a.onClick}
          disabled={a.disabled}
          className="h-8 text-xs gap-1.5"
        >
          {a.icon && <a.icon className="h-3.5 w-3.5" />}
          {a.label}
        </Button>
      ))}
    </div>
  );
}
