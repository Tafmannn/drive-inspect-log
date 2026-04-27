import type { ReactNode } from "react";
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WarningCalloutSeverity = "info" | "warning" | "critical" | "success";

const styles: Record<WarningCalloutSeverity, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: "border-primary/20 bg-primary/5 text-foreground",
    icon: <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />,
  },
  warning: {
    wrap: "border-warning/30 bg-warning/5 text-foreground",
    icon: <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />,
  },
  critical: {
    wrap: "border-destructive/30 bg-destructive/5 text-foreground",
    icon: <ShieldAlert className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />,
  },
  success: {
    wrap: "border-success/30 bg-success/5 text-foreground",
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />,
  },
};

/**
 * WarningCallout — unified warning / info row. One consistent shape, one
 * severity scale. Use a list of these for multiple warnings.
 */
export function WarningCallout({
  severity = "warning",
  children,
  className,
}: {
  severity?: WarningCalloutSeverity;
  children: ReactNode;
  className?: string;
}) {
  const s = styles[severity];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-snug",
        s.wrap,
        className,
      )}
    >
      {s.icon}
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}
