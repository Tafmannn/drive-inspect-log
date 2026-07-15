import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { techFeatures } from "../content/marketingContent";

export function TechnologySection() {
  return (
    <MarketingSection tone="dark" labelledBy="technology-heading">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div data-reveal>
          <SectionHeading
            id="technology-heading"
            eyebrow="The Axentra platform"
            title="A clearer record of every vehicle movement."
            description="Axentra’s operational platform supports the movement process from job assignment and inspection to evidence review and proof of delivery. It helps replace fragmented messages and unstructured photographs with a more consistent movement record."
            tone="dark"
          />
          <MarketingButton to="/technology" variant="outlineOnDark" size="lg" className="mt-8">
            Explore Axentra technology
          </MarketingButton>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {techFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <li
                key={feature.key}
                data-reveal
                style={{ "--reveal-delay": `${(i % 2) * 70}ms` } as React.CSSProperties}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5"
              >
                <Icon className="h-5 w-5 shrink-0 text-marketing-electric" aria-hidden="true" />
                <span className="text-sm font-medium text-white">{feature.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </MarketingSection>
  );
}
