import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { ContentProse } from "../components/ContentProse";
import { LegalNotice } from "../components/LegalNotice";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { SITE } from "../content/marketingContent";

export function PrivacyPage() {
  usePageMeta(pageMeta.privacy);
  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Legal"
        title="Privacy policy"
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Privacy", path: "/privacy" },
        ]}
      />
      <MarketingSection tone="light">
        <LegalNotice />
        <ContentProse>
          <h2>Who we are</h2>
          <p>
            {SITE.name} (&ldquo;Axentra&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides driven
            vehicle movement services in the United Kingdom. This policy explains how we handle
            information submitted through this website.
          </p>

          <h2>Information we collect</h2>
          <h3>Movement enquiry information</h3>
          <p>
            When you submit a movement request, we collect the details you provide, such as your
            name, company, contact details, vehicle information and the collection and delivery
            information needed to review the enquiry.
          </p>
          <h3>Website technical data</h3>
          <p>
            We may process limited technical information required to operate and secure the website.
          </p>

          <h2>Why we use information</h2>
          <ul>
            <li>To respond to enquiries and provide requested services</li>
            <li>To operate, secure and improve the website</li>
            <li>To meet legal and regulatory obligations</li>
          </ul>

          <h2>Legal bases</h2>
          <p>
            We rely on legitimate interests, taking steps at your request prior to entering into a
            contract, consent where appropriate, and compliance with legal obligations.
          </p>

          <h2>Email communications</h2>
          <p>
            We use a third-party email provider to send enquiry acknowledgements and to notify our
            team of new enquiries.
          </p>

          <h2>Data sharing and service providers</h2>
          <p>
            We do not sell your information. We use trusted service providers (for example, hosting
            and email delivery) who process information on our behalf under appropriate terms.
          </p>

          <h2>Data retention</h2>
          <p>
            We keep enquiry information only as long as necessary for the purposes described here or
            as required by law.
          </p>

          <h2>Security</h2>
          <p>
            We take reasonable measures to protect information. No method of transmission or storage
            is completely secure.
          </p>

          <h2>Your rights</h2>
          <p>
            Subject to applicable law, you may have rights to access, correct, delete or restrict
            the processing of your information. To exercise these rights, contact us using the
            details below.
          </p>

          <h2>Complaints</h2>
          <p>
            If you have concerns about how we handle your information, you may contact us and, where
            applicable, the relevant supervisory authority.
          </p>

          <h2>Contact</h2>
          <p>
            Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. Axentra is based
            in {SITE.base}.
          </p>

          <h2>Changes to this policy</h2>
          <p>We may update this policy from time to time. Please check this page periodically.</p>
        </ContentProse>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default PrivacyPage;
