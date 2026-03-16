/**
 * Attention Center – Shared component mounted in both Admin and Super Admin dashboards.
 * `scope="org"` for Admin (RLS handles filtering).
 * `scope="all"` for Super Admin (shows org column + org filter).
 */

import { useState } from "react";
import { AttentionKpis } from "./AttentionKpis";
import { AttentionFilters } from "./AttentionFilters";
import { AttentionQueue } from "./AttentionQueue";
import { useAttentionData } from "../hooks/useAttentionData";
import type { AttentionFiltersState } from "../types/exceptionTypes";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  scope: "org" | "all";
}

const DEFAULT_FILTERS: AttentionFiltersState = {
  severity: "all",
  category: "all",
  orgId: "all",
  dateFrom: "",
  dateTo: "",
};

export function AttentionCenter({ scope }: Props) {
  const [filters, setFilters] = useState<AttentionFiltersState>(DEFAULT_FILTERS);
  const { data, isLoading, isFetching, refetch } = useAttentionData({ scope, filters });
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  return (
    <div className="space-y-4">
      <AttentionKpis kpis={data?.kpis} loading={isLoading} />

      <Separator />

      <AttentionFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={() => refetch()}
        refreshing={isFetching}
        showOrgFilter={scope === "all"}
        orgs={data?.orgs ?? []}
      />

      <AttentionQueue
        exceptions={data?.exceptions ?? []}
        showOrg={scope === "all"}
        loading={isLoading}
      />

      {(data?.acknowledgedCount ?? 0) > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setShowAcknowledged(!showAcknowledged)}
          >
            {showAcknowledged ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            {data?.acknowledgedCount} acknowledged
          </Button>
          {showAcknowledged && (
            <div className="opacity-60">
              <AttentionQueue
                exceptions={data?.acknowledgedExceptions ?? []}
                showOrg={scope === "all"}
                loading={false}
                acknowledged
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
