import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { FilterBar } from "../components/shared/FilterBar";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";

export function ControlJobs() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Jobs"
        subtitle="Manage, monitor, and control all vehicle movement jobs"
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Job
          </Button>
        }
      />

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by reg, client, location…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="text-xs">
          Status
        </Button>
        <Button variant="outline" size="sm" className="text-xs">
          Date Range
        </Button>
        <Button variant="outline" size="sm" className="text-xs">
          Driver
        </Button>
      </FilterBar>

      <PageSection>
        <SectionHeader title="All Jobs" description="Filtered view of all jobs across your organisation" />
        <SkeletonBlock className="h-[400px]" />
      </PageSection>
    </ControlPageContainer>
  );
}
