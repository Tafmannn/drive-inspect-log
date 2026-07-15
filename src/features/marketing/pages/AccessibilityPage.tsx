import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { ContentProse } from "../components/ContentProse";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { SITE } from "../content/marketingContent";

export function AccessibilityPage() {
  usePageMeta(pageMeta.accessibility);
  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Legal"
        title="Accessibility statement"
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Accessibility", path: "/accessibility" },
        ]}
      />
      <MarketingSection tone="light">
        <ContentProse>
          <h2>Our commitment</h2>
          <p>
            {SITE.name} is committed to making this website usable for as many people as possible.
            We aim to meet the WCAG 2.2 AA guidelines where practical.
          </p>

          <h2>Accessibility features</h2>
          <ul>
            <li>Keyboard-accessible navigation and a skip-to-content link</li>
            <li>Semantic landmarks and a logical heading structure</li>
            <li>Visible focus indicators</li>
            <li>Support for reduced-motion preferences</li>
            <li>Labelled forms with accessible validation messages</li>
            <li>Colour contrast that aims to meet AA where practical</li>
          </ul>

          <h2>Known limitations</h2>
          <p>
            We continue to review and improve accessibility. Some areas may not yet fully meet our
            target standard. If you encounter a barrier, please let us know.
          </p>

          <h2>Feedback</h2>
          <p>
            If you experience any difficulty using this website, contact{" "}
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> and we will do our best
            to help and to address the issue.
          </p>

          <h2>Review</h2>
          <p>This statement will be reviewed and updated as the website develops.</p>
        </ContentProse>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default AccessibilityPage;
