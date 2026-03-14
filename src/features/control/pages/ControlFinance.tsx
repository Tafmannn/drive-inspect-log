import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { MetricCard } from "../components/shared/MetricCard";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";
import { PoundSterling, Receipt, FileText } from "lucide-react";

export function ControlFinance() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Finance"
        subtitle="Revenue tracking, expenses, and invoice management"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Revenue (MTD)" icon={PoundSterling} loading />
        <MetricCard label="Expenses (MTD)" icon={Receipt} loading />
        <MetricCard label="Invoices Sent" icon={FileText} loading />
        <MetricCard label="Outstanding" icon={PoundSterling} loading />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <PageSection>
          <SectionHeader title="Revenue Breakdown" description="Income by client and job type" />
          <SkeletonBlock className="h-[300px]" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Recent Invoices" description="Latest invoices and payment status" />
          <SkeletonBlock className="h-[300px]" />
        </PageSection>
      </div>
    </ControlPageContainer>
  );
}
