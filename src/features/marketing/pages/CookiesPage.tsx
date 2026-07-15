import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { ContentProse } from "../components/ContentProse";
import { LegalNotice } from "../components/LegalNotice";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { SITE } from "../content/marketingContent";

export function CookiesPage() {
  usePageMeta(pageMeta.cookies);
  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Legal"
        title="Cookie policy"
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Cookies", path: "/cookies" },
        ]}
      />
      <MarketingSection tone="light">
        <LegalNotice />
        <ContentProse>
          <p>
            This policy explains how {SITE.name} uses cookies and similar technologies on this
            website.
          </p>

          <h2>Necessary cookies</h2>
          <p>
            Some cookies are essential for the website to function, including secure sign-in to the
            Axentra platform.
          </p>

          <h2>Authentication cookies</h2>
          <p>
            When you sign in to the Axentra application, authentication cookies keep you signed in
            during your session.
          </p>

          <h2>Analytics cookies</h2>
          <p>
            The public marketing site does not set non-essential analytics cookies by default. If
            analytics are introduced in future, this policy will be updated and appropriate consent
            will be sought where required.
          </p>

          <h2>How to control cookies</h2>
          <p>
            You can control and delete cookies through your browser settings. Blocking essential
            cookies may affect how parts of the website and application work.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about cookies can be sent to{" "}
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
          </p>
        </ContentProse>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default CookiesPage;
