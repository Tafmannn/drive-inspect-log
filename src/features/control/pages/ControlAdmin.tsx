import { ControlPageContainer } from "../components/ControlPageContainer";
import { ControlPageHeader } from "../components/ControlPageHeader";
import { PageSection, SectionHeader } from "../components/shared/PageSection";
import { SkeletonBlock } from "../components/shared/LoadingState";

export function ControlAdmin() {
  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Administration"
        subtitle="User management, role assignments, and organisation settings"
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <PageSection>
          <SectionHeader title="Users & Roles" description="Manage team members and access control" />
          <SkeletonBlock className="h-[300px]" />
        </PageSection>
        <PageSection>
          <SectionHeader title="Organisation Settings" description="Company details and configuration" />
          <SkeletonBlock className="h-[300px]" />
        </PageSection>
      </div>
    </ControlPageContainer>
  );
}
