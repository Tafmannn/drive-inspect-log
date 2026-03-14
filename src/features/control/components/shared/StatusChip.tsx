import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "destructive" | "muted" | "info" | "default";

const variantClasses: Record<StatusVariant, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/20",
  default: "bg-primary/10 text-primary border-primary/20",
};

export function StatusChip({
  label,
  variant = "default",
  className,
}: {
  label: string;
  variant?: StatusVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
