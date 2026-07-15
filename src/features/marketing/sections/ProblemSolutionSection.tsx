import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { solutionPillars } from "../content/marketingContent";

export function ProblemSolutionSection() {
  return (
    <MarketingSection tone="light" labelledBy="problem-heading">
      <div data-reveal>
        <SectionHeading
          id="problem-heading"
          eyebrow="More than a driver and a destination"
          title="Moving the vehicle is only part of the job."
          description="Vehicle logistics becomes difficult when communication is inconsistent, condition evidence is incomplete or handovers are poorly documented. Axentra combines professional driven movements with a clearer digital process from collection to delivery."
        />
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {solutionPillars.map((pillar, i) => {
          const Icon = pillar.icon;
          return (
            <div
              key={pillar.key}
              data-reveal
              style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
              className="rounded-2xl border border-marketing-border bg-marketing-bg-light p-7"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-marketing-navy text-white">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-heading text-xl font-semibold text-marketing-text">
                {pillar.title}
              </h3>
              <p className="mt-2.5 leading-relaxed text-marketing-text-secondary">
                {pillar.description}
              </p>
            </div>
          );
        })}
      </div>
    </MarketingSection>
  );
}
