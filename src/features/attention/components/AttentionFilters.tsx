/**
 * Attention Filters — compact mobile-first filter bar.
 * Severity chips, category dropdown, org filter (global only), refresh.
 * Date fields removed to reduce clutter on mobile.
 */

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import type { AttentionFiltersState, ExceptionSeverity } from "../types/exceptionTypes";
import { cn } from "@/lib/utils";

interface Props {
  filters: AttentionFiltersState;
  onChange: (f: AttentionFiltersState) => void;
  onRefresh: () => void;
  refreshing: boolean;
  showOrgFilter: boolean;
  orgs: { id: string; name: string }[];
}

const SEVERITY_OPTIONS: { label: string; value: ExceptionSeverity | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

export function AttentionFilters({ filters, onChange, onRefresh, refreshing, showOrgFilter, orgs }: Props) {
  const set = (partial: Partial<AttentionFiltersState>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Severity chips */}
      <div className="flex gap-1 flex-wrap">
        {SEVERITY_OPTIONS.map(opt => (
          <Button
            key={opt.value}
            size="sm"
            variant={filters.severity === opt.value ? "default" : "outline"}
            className={cn(
              "text-xs h-8 px-2.5",
              filters.severity === opt.value && opt.value === "critical" && "bg-destructive hover:bg-destructive/90",
              filters.severity === opt.value && opt.value === "high" && "bg-destructive/80 hover:bg-destructive/70",
            )}
            onClick={() => set({ severity: opt.value })}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Category dropdown */}
      <Select value={filters.category} onValueChange={v => set({ category: v as any })}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="timing">⏱ Timing</SelectItem>
          <SelectItem value="evidence">📎 Evidence</SelectItem>
          <SelectItem value="sync">🔄 Sync</SelectItem>
          <SelectItem value="state">🔒 State</SelectItem>
        </SelectContent>
      </Select>

      {/* Org filter (global only) */}
      {showOrgFilter && (
        <Select value={filters.orgId} onValueChange={v => set({ orgId: v })}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orgs</SelectItem>
            {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Refresh */}
      <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
