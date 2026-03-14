import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { MetricCard } from "../components/shared/MetricCard";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";
import { ShieldCheck, FileWarning, ClipboardCheck } from "lucide-react";

export function ControlCompliance() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Compliance"
        subtitle="Inspection audits, damage tracking, and operational compliance"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Inspections (30d)" icon={ClipboardCheck} loading />
        <MetricCard label="Damage Reports" icon={FileWarning} loading />
        <MetricCard label="Compliance Rate" icon={ShieldCheck} loading />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <PageSection>
          <SectionHeader title="Recent Inspections" description="Latest pickup and delivery inspections" />
          <SkeletonBlock className="h-[280px]" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Outstanding Issues" description="Unresolved damage reports and flags" />
          <SkeletonBlock className="h-[280px]" />
        </PageSection>
      </div>
    </ControlPageContainer>
  );
}
