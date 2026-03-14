import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { MetricCard } from "../components/shared/MetricCard";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";
import { Crown, Building2, Users, Server } from "lucide-react";

export function ControlSuperAdmin() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Super Admin"
        subtitle="Platform-wide oversight, multi-tenant management, and system health"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Organisations" icon={Building2} loading />
        <MetricCard label="Total Users" icon={Users} loading />
        <MetricCard label="Total Jobs" icon={Crown} loading />
        <MetricCard label="System Health" icon={Server} loading />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <PageSection>
          <SectionHeader title="Organisations" description="All registered tenants" />
          <SkeletonBlock className="h-[280px]" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Global Users" description="All users across all organisations" />
          <SkeletonBlock className="h-[280px]" />
        </PageSection>
        <PageSection>
          <SectionHeader title="System Health" description="API status and integration health" />
          <SkeletonBlock className="h-[280px]" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Error Log" description="Recent system errors and failures" />
          <SkeletonBlock className="h-[280px]" />
        </PageSection>
      </div>
    </ControlPageContainer>
  );
}
