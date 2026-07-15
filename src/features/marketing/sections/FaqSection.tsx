import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { FaqAccordion } from "../components/FaqAccordion";
import { faqs } from "../content/marketingContent";

export function FaqSection() {
  return (
    <MarketingSection tone="muted" labelledBy="faq-heading">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div data-reveal>
          <SectionHeading
            id="faq-heading"
            eyebrow="FAQ"
            title="Questions about moving vehicles with Axentra."
          />
        </div>
        <div data-reveal>
          <FaqAccordion items={faqs} />
        </div>
      </div>
    </MarketingSection>
  );
}
