import { Check } from "lucide-react";
import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { FaqAccordion } from "../components/FaqAccordion";
import { DriverApplicationForm } from "../components/DriverApplicationForm";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { breadcrumbSchema, faqSchema } from "../content/structuredData";
import { driverExpectations, driverProcess, driverFaqs } from "../content/marketingContent";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

const roleInvolves = [
  "Collecting and delivering vehicles",
  "Completing structured inspections",
  "Capturing clear photographs",
  "Recording mileage and condition",
  "Communicating delays or issues",
  "Obtaining signatures",
  "Following movement instructions",
  "Representing Axentra professionally",
];

export function DriversPage() {
  const { track } = useMarketingAnalytics();
  usePageMeta(pageMeta.drivers, [
    faqSchema(driverFaqs),
    breadcrumbSchema([
      { name: "Home", path: "/home" },
      { name: "Drivers", path: "/drivers" },
    ]),
  ]);

  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Drive with Axentra"
        title="Join a driver network built around professional standards."
        description="Axentra is looking for dependable vehicle movement professionals who take pride in inspections, communication, vehicle care and customer handovers."
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Drivers", path: "/drivers" },
        ]}
        actions={
          <>
            <MarketingButton to="/drivers" variant="primary" size="lg"
              onClick={() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })}>
              Apply to drive with Axentra
            </MarketingButton>
            <MarketingButton to="/login" variant="outlineOnDark" size="lg"
              onClick={() => track("login_clicked_from_marketing", { source: "drivers_hero" })}>
              Existing driver sign in
            </MarketingButton>
          </>
        }
      />

      <MarketingSection tone="light">
        <div className="grid gap-12 lg:grid-cols-2">
          <div data-reveal>
            <SectionHeading title="What the role involves" as="h2" />
            <ul className="mt-6 space-y-2.5">
              {roleInvolves.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-marketing-text-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-marketing-success" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal>
            <SectionHeading title="What Axentra expects" as="h2" />
            <ul className="mt-6 space-y-2.5">
              {driverExpectations.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-marketing-text-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-marketing-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection tone="muted">
        <div data-reveal>
          <SectionHeading eyebrow="Application process" title="How applying works" as="h2" />
        </div>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {driverProcess.map((step, i) => (
            <li key={step} data-reveal className="rounded-xl border border-marketing-border bg-white p-5 shadow-marketing-sm">
              <span className="font-heading text-sm font-bold text-marketing-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-1.5 font-medium text-marketing-text">{step}</p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection id="apply" tone="light">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div data-reveal>
            <SectionHeading eyebrow="Apply" title="Register your interest" as="h2"
              description="Applying registers your interest. It does not guarantee approval, work or specific earnings. We only collect what we need to review your application." />
            <div className="mt-6">
              <FaqAccordion items={driverFaqs} />
            </div>
          </div>
          <div data-reveal className="rounded-2xl border border-marketing-border bg-marketing-bg-light p-6 shadow-marketing-sm sm:p-8">
            <DriverApplicationForm />
          </div>
        </div>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default DriversPage;
