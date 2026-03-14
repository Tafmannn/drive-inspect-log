import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { MetricCard } from "../components/shared/MetricCard";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";
import { Truck, Users, ShieldCheck, PoundSterling } from "lucide-react";

export function ControlOverview() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Command Center"
        subtitle="Operational overview and key performance indicators"
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Active Jobs" icon={Truck} loading />
        <MetricCard label="Drivers on Duty" icon={Users} loading />
        <MetricCard label="Compliance Score" icon={ShieldCheck} loading />
        <MetricCard label="Revenue (MTD)" icon={PoundSterling} loading />
      </div>

      {/* Panel Grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        <PageSection>
          <SectionHeader title="Operations Snapshot" description="Today's job pipeline" />
          <SkeletonBlock className="h-48" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Recent Activity" description="Latest events across the platform" />
          <SkeletonBlock className="h-48" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Fleet Status" description="Driver availability and workload" />
          <SkeletonBlock className="h-48" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Compliance Alerts" description="Items requiring attention" />
          <SkeletonBlock className="h-48" />
        </PageSection>
      </div>
    </ControlPageContainer>
  );
}
