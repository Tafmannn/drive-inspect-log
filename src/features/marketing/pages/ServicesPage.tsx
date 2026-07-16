import { Check, AlertCircle } from "lucide-react";
import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { servicesSchema, breadcrumbSchema } from "../content/structuredData";
import { services } from "../content/marketingContent";

const beforeAccepting = [
  "Vehicle registration",
  "Make and model",
  "Running status",
  "Collection and delivery addresses",
  "Contact information",
  "Preferred date",
  "Vehicle condition information",
  "Tax, MOT, trade-plate or movement eligibility information where relevant",
  "Any special instructions",
];

const limitations = [
  "Movements are driven, not transported",
  "Subject to vehicle roadworthiness and legal eligibility",
  "Subject to driver availability",
  "Subject to insurance eligibility",
  "Non-running vehicles normally require alternative transport",
  "High-value, specialist or modified vehicles may require additional review",
  "A booking is not confirmed until accepted in writing",
];

export function ServicesPage() {
  usePageMeta(pageMeta.services, [
    servicesSchema(),
    breadcrumbSchema([
      { name: "Home", path: "/home" },
      { name: "Services", path: "/services" },
    ]),
  ]);

  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Axentra services"
        title="Professional driven vehicle movements for automotive businesses."
        description="Flexible collection and delivery services supported by structured inspections, clear communication and digital proof of delivery."
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Services", path: "/services" },
        ]}
        image={{ src: "/img/handover.jpg", alt: "An Axentra driver completing a digital handover form in a vehicle" }}
        actions={
          <MarketingButton to="/contact" variant="primary" size="lg">
            Request a movement
          </MarketingButton>
        }
      />

      <MarketingSection tone="light">
        <div className="grid gap-8 md:grid-cols-2">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.key}
                data-reveal
                className="rounded-2xl border border-marketing-border bg-white p-8 shadow-marketing-sm"
              >
                <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-marketing-primary/10 text-marketing-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="font-heading text-xl font-semibold text-marketing-text">
                  {service.title}
                </h2>
                <p className="mt-2 text-marketing-text-secondary">{service.short}</p>
                <ul className="mt-4 space-y-2">
                  {service.detail.map((d) => (
                    <li key={d} className="flex items-start gap-2.5 text-sm text-marketing-text-secondary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-marketing-success" aria-hidden="true" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </MarketingSection>

      <MarketingSection tone="muted">
        <div className="grid gap-10 lg:grid-cols-2">
          <div data-reveal>
            <SectionHeading title="What we need before accepting a movement" as="h2" />
            <ul className="mt-6 space-y-2.5">
              {beforeAccepting.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-marketing-text-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-marketing-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal>
            <SectionHeading title="Service limitations" as="h2" />
            <ul className="mt-6 space-y-2.5">
              {limitations.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-marketing-text-secondary">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-marketing-warning" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection tone="navy">
        <div data-reveal className="text-center">
          <SectionHeading
            align="center"
            tone="dark"
            title="Discuss your vehicle movement requirements"
            className="mx-auto"
          />
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

export default ServicesPage;
