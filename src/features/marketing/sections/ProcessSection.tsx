import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { ProcessStep } from "../components/ProcessStep";
import { processSteps } from "../content/marketingContent";

export function ProcessSection() {
  return (
    <MarketingSection id="how-it-works" tone="light" labelledBy="process-heading">
      <div data-reveal>
        <SectionHeading
          id="process-heading"
          eyebrow="How it works"
          title="A clear process from request to handover."
        />
      </div>

      <ol className="mt-12 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
        {processSteps.map((step, i) => (
          <li
            key={step.key}
            data-reveal
            style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
            className="relative"
          >
            {/* connector line on large screens */}
            {i < processSteps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-11 right-0 top-5 hidden h-px bg-marketing-border lg:block"
              />
            )}
            <ProcessStep step={step} />
          </li>
        ))}
      </ol>
    </MarketingSection>
  );
}
