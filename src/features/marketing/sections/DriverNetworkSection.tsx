import { Check } from "lucide-react";
import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { driverExpectations } from "../content/marketingContent";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

export function DriverNetworkSection() {
  const { track } = useMarketingAnalytics();
  return (
    <MarketingSection tone="light" labelledBy="drivers-heading">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div data-reveal>
          <SectionHeading
            id="drivers-heading"
            eyebrow="Drive with Axentra"
            title="Professional drivers. Better processes. Higher standards."
            description="Axentra is building a trusted driver network for people who understand that vehicle movement requires more than reaching a destination. It requires care, communication, accurate inspections and professional customer service."
          />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingButton
              to="/drivers"
              variant="primary"
              size="lg"
              onClick={() => track("marketing_cta_clicked", { cta: "become_driver", location: "home" })}
            >
              Become an Axentra driver
            </MarketingButton>
            <MarketingButton
              to="/login"
              variant="secondary"
              size="lg"
              onClick={() => track("login_clicked_from_marketing", { source: "driver_section" })}
            >
              Driver sign in
            </MarketingButton>
          </div>
        </div>

        <ul data-reveal className="grid gap-3 sm:grid-cols-2">
          {driverExpectations.map((item) => (
            <li
              key={item}
              className="flex items-center gap-3 rounded-xl border border-marketing-border bg-marketing-bg-light px-4 py-3"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-marketing-primary/10 text-marketing-primary">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-marketing-text">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </MarketingSection>
  );
}
