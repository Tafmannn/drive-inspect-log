import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { MetricCard } from "../components/shared/MetricCard";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";
import { Users, CheckCircle, AlertTriangle } from "lucide-react";

export function ControlDrivers() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Drivers"
        subtitle="Fleet roster, availability, and performance tracking"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Total Drivers" icon={Users} loading />
        <MetricCard label="Active Today" icon={CheckCircle} loading />
        <MetricCard label="Licence Expiring" icon={AlertTriangle} loading />
      </div>

      <PageSection>
        <SectionHeader title="Driver Roster" description="All registered drivers in your organisation" />
        <SkeletonBlock className="h-[350px]" />
      </PageSection>
    </ControlPageContainer>
  );
}
