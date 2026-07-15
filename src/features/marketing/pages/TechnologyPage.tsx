import { Check, ShieldCheck } from "lucide-react";
import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { EvidencePreview } from "../components/EvidencePreview";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { breadcrumbSchema } from "../content/structuredData";
import { techLifecycle, techFeatures } from "../content/marketingContent";

const privacyPoints = [
  "Access controls",
  "Private operational records",
  "Secure authentication",
  "Role-based access",
  "Evidence handled through controlled systems",
];

const plannedDevelopment = [
  "Customer visibility",
  "Recurring accounts",
  "Operational reporting",
  "Driver-network expansion",
  "Improved service consistency",
];

export function TechnologyPage() {
  usePageMeta(pageMeta.technology, [
    breadcrumbSchema([
      { name: "Home", path: "/home" },
      { name: "Technology", path: "/technology" },
    ]),
  ]);

  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Axentra technology"
        title="Vehicle logistics with a clearer digital record."
        description="The Axentra platform helps organise movement details, guide inspections, capture evidence and create dependable proof of delivery."
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Technology", path: "/technology" },
        ]}
      />

      <MarketingSection tone="light">
        <div data-reveal>
          <SectionHeading eyebrow="Lifecycle" title="From job details to completion" as="h2" />
        </div>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {techLifecycle.map((stage, i) => (
            <li
              key={stage}
              data-reveal
              className="rounded-xl border border-marketing-border bg-marketing-bg-light p-5"
            >
              <span className="font-heading text-sm font-bold text-marketing-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-1.5 font-medium text-marketing-text">{stage}</p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection tone="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal>
            <SectionHeading
              eyebrow="Structured inspection"
              title="Guided evidence, captured consistently"
              as="h2"
              description="Axentra guides evidence collection so the important details are captured the same way on every movement — reducing inconsistency between jobs and drivers."
            />
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {techFeatures.map((f) => (
                <li key={f.key} className="flex items-center gap-2.5 text-sm text-marketing-text-secondary">
                  <Check className="h-4 w-4 shrink-0 text-marketing-success" aria-hidden="true" />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal>
            <EvidencePreview />
          </div>
        </div>
      </MarketingSection>

      <MarketingSection tone="dark">
        <div className="grid gap-12 lg:grid-cols-2">
          <div data-reveal>
            <SectionHeading
              eyebrow="Privacy and security"
              title="Operational records, handled with care"
              as="h2"
              tone="dark"
              description="Axentra keeps movement information connected to the job through controlled systems, rather than scattered across text messages and personal photo galleries."
            />
            <ul className="mt-6 space-y-2.5">
              {privacyPoints.map((p) => (
                <li key={p} className="flex items-center gap-3 text-marketing-on-dark-muted">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-marketing-electric" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal className="rounded-2xl border border-white/10 bg-white/5 p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-marketing-electric">
              Planned platform development
            </p>
            <p className="mt-2 text-marketing-on-dark-muted">
              Axentra’s platform creates a foundation for future capability. These are planned
              developments, not features available today:
            </p>
            <ul className="mt-4 space-y-2">
              {plannedDevelopment.map((p) => (
                <li key={p} className="flex items-center gap-3 text-marketing-on-dark">
                  <span className="h-1.5 w-1.5 rounded-full bg-marketing-electric" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection tone="navy">
        <div data-reveal className="text-center">
          <SectionHeading align="center" tone="dark" title="See the Axentra process in action" as="h2" />
          <div className="mt-8">
            <MarketingButton to="/contact" variant="primary" size="lg">
              Request a vehicle movement
            </MarketingButton>
          </div>
        </div>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default TechnologyPage;
