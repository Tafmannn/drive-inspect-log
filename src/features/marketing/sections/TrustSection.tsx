import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { TrustBadge } from "../components/TrustBadge";
import { trustPoints, insuranceQualifier } from "../content/marketingContent";

export function TrustSection() {
  return (
    <MarketingSection tone="light" labelledBy="trust-heading">
      <div data-reveal>
        <SectionHeading
          id="trust-heading"
          eyebrow="Professional standards"
          title="Confidence at every stage of the movement."
        />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {trustPoints.map((point, i) => (
          <div
            key={point.key}
            data-reveal
            style={{ "--reveal-delay": `${(i % 4) * 60}ms` } as React.CSSProperties}
          >
            <TrustBadge label={point.label} icon={point.icon} />
          </div>
        ))}
      </div>

      <p data-reveal className="mt-8 max-w-3xl text-sm text-marketing-text-muted">
        {insuranceQualifier}
      </p>
    </MarketingSection>
  );
}
