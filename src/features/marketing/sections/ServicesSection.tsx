import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { ServiceCard } from "../components/ServiceCard";
import { MarketingButton } from "../components/MarketingButton";
import { services } from "../content/marketingContent";

export function ServicesSection() {
  return (
    <MarketingSection tone="muted" labelledBy="services-heading">
      <div data-reveal>
        <SectionHeading
          id="services-heading"
          eyebrow="Services"
          title="Vehicle movement services built around your operation."
          description="From one-off dealership deliveries to recurring fleet movements, Axentra provides professional driven logistics supported by documented handovers."
        />
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, i) => (
          <div
            key={service.key}
            data-reveal
            style={{ "--reveal-delay": `${(i % 3) * 80}ms` } as React.CSSProperties}
          >
            <ServiceCard service={service} to="/services" className="h-full" />
          </div>
        ))}
      </div>

      <div data-reveal className="mt-10">
        <MarketingButton to="/services" variant="secondary" size="lg">
          Explore all services
        </MarketingButton>
      </div>
    </MarketingSection>
  );
}
