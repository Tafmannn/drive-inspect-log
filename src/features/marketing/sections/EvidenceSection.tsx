import { Check } from "lucide-react";
import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { EvidencePreview } from "../components/EvidencePreview";
import { evidenceBenefits } from "../content/marketingContent";

export function EvidenceSection() {
  return (
    <MarketingSection tone="muted" labelledBy="evidence-heading">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div data-reveal className="order-2 lg:order-1">
          <EvidencePreview />
        </div>

        <div data-reveal className="order-1 lg:order-2">
          <SectionHeading
            id="evidence-heading"
            eyebrow="Documented handovers"
            title="Evidence customers can actually use."
            description="A consistent movement record can support customer service, operational review and the resolution of condition queries. Axentra captures the important details at the points where they matter."
          />
          <ul className="mt-7 space-y-3">
            {evidenceBenefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-marketing-success/15 text-marketing-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="text-marketing-text-secondary">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MarketingSection>
  );
}
