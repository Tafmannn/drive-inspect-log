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
    </div>
  );
}
