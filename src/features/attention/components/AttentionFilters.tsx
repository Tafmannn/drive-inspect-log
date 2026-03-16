import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RefreshCw } from "lucide-react";
import type { AttentionFiltersState } from "../types/exceptionTypes";

interface Props {
  filters: AttentionFiltersState;
  onChange: (f: AttentionFiltersState) => void;
  onRefresh: () => void;
  refreshing: boolean;
  showOrgFilter: boolean;
  orgs: { id: string; name: string }[];
}

export function AttentionFilters({ filters, onChange, onRefresh, refreshing, showOrgFilter, orgs }: Props) {
  const set = (partial: Partial<AttentionFiltersState>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.severity} onValueChange={v => set({ severity: v as any })}>
        <SelectTrigger className="w-[120px] min-h-[40px] text-sm">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All severity</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.category} onValueChange={v => set({ category: v as any })}>
        <SelectTrigger className="w-[120px] min-h-[40px] text-sm">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="timing">Timing</SelectItem>
          <SelectItem value="evidence">Evidence</SelectItem>
          <SelectItem value="sync">Sync</SelectItem>
          <SelectItem value="state">State</SelectItem>
        </SelectContent>
      </Select>

      {showOrgFilter && (
        <Select value={filters.orgId} onValueChange={v => set({ orgId: v })}>
          <SelectTrigger className="w-[160px] min-h-[40px] text-sm">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orgs</SelectItem>
            {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Input
        type="date"
        className="w-[140px] min-h-[40px] text-sm"
        value={filters.dateFrom}
        onChange={e => set({ dateFrom: e.target.value })}
        placeholder="From"
      />
      <Input
        type="date"
        className="w-[140px] min-h-[40px] text-sm"
        value={filters.dateTo}
        onChange={e => set({ dateTo: e.target.value })}
        placeholder="To"
      />

      <Button variant="outline" size="sm" className="min-h-[40px]" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
      </Button>
    </div>
  );
}
