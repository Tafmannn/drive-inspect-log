/**
 * Command Center status chip. Only says "All Clear" when the attention data
 * actually loaded and holds no open exceptions — never while loading, after
 * an error, or with medium/low items still open.
 */
export interface StatusChip {
  label: string;
  tone: "critical" | "warning" | "neutral" | "success";
}

export function overviewStatus(input: {
  loading: boolean;
  error: boolean;
  severities: string[];
}): StatusChip {
  if (input.loading) return { label: "Checking…", tone: "neutral" };
  if (input.error) return { label: "Status unavailable", tone: "neutral" };
  const n = input.severities.length;
  if (input.severities.includes("critical")) return { label: "Critical", tone: "critical" };
  if (input.severities.includes("high")) return { label: "Attention Required", tone: "warning" };
  if (n > 0) return { label: `${n} open item${n === 1 ? "" : "s"}`, tone: "neutral" };
  return { label: "All Clear", tone: "success" };
}

export const STATUS_TONE_CLASS: Record<StatusChip["tone"], string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success/10 text-success border-success/30",
};
