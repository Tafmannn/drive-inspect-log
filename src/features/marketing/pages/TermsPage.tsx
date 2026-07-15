import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { ContentProse } from "../components/ContentProse";
import { LegalNotice } from "../components/LegalNotice";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { SITE } from "../content/marketingContent";

export function TermsPage() {
  usePageMeta(pageMeta.terms);
  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Legal"
        title="Terms of website use"
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Terms", path: "/terms" },
        ]}
      />
      <MarketingSection tone="light">
        <LegalNotice />
        <ContentProse>
          <h2>Website information</h2>
          <p>
            This website provides information about {SITE.name} and its driven vehicle movement
            services. Information is provided in good faith and may change without notice.
          </p>

          <h2>Enquiry submissions</h2>
          <p>
            Forms on this website allow you to submit enquiries. You are responsible for the
            accuracy of the information you provide.
          </p>

          <h2>No booking until written confirmation</h2>
          <p>
            <strong>
              Submitting an enquiry does not create a booking or contract. A movement is only
              confirmed once Axentra reviews the request and confirms availability and pricing in
              writing.
            </strong>
          </p>

          <h2>Service availability</h2>
          <p>
            Services are subject to availability, vehicle suitability, roadworthiness, legal
            eligibility and insurance eligibility.
          </p>

          <h2>Accuracy of supplied information</h2>
          <p>
            Axentra relies on the information you supply. Inaccurate information may affect our
            ability to provide a service or a quotation.
          </p>

          <h2>Intellectual property</h2>
          <p>
            The content, branding and design of this website belong to Axentra or its licensors and
            may not be used without permission.
          </p>

          <h2>Liability</h2>
          <p>
            To the extent permitted by law, Axentra is not liable for any loss arising from reliance
            on website content. Nothing in these terms excludes liability that cannot be excluded by
            law.
          </p>

          <h2>External links</h2>
          <p>Where we link to third-party websites, we are not responsible for their content.</p>

          <h2>Governing law</h2>
          <p>These terms are governed by the laws of England and Wales.</p>

          <h2>Contact</h2>
          <p>
            Questions about these terms can be sent to{" "}
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
          </p>
        </ContentProse>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default TermsPage;
