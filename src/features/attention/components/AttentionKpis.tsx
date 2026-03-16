import { Truck, AlertTriangle, FileSignature, Upload, RefreshCw } from "lucide-react";
import type { AttentionKpiData } from "../types/exceptionTypes";

interface Props {
  kpis: AttentionKpiData | undefined;
  loading: boolean;
}

const kpiDefs = [
  { key: "activeJobs" as const, label: "Active Jobs", icon: Truck, iconClass: "bg-primary/10 text-primary" },
  { key: "highSeverity" as const, label: "High Severity", icon: AlertTriangle, iconClass: "bg-destructive/10 text-destructive" },
  { key: "missingSignatures" as const, label: "Missing Signatures", icon: FileSignature, iconClass: "bg-warning/10 text-warning" },
  { key: "uploadFailuresToday" as const, label: "Upload Failures Today", icon: Upload, iconClass: "bg-destructive/10 text-destructive" },
  { key: "syncErrorsToday" as const, label: "Sync Errors Today", icon: RefreshCw, iconClass: "bg-warning/10 text-warning" },
];

export function AttentionKpis({ kpis, loading }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpiDefs.map(({ key, label, icon: Icon, iconClass }) => (
        <div key={key} className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${iconClass}`}>
            <Icon className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <p className="text-[20px] font-semibold text-foreground tabular-nums">
              {loading ? "…" : (kpis?.[key] ?? 0)}
            </p>
            <p className="text-[13px] text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
