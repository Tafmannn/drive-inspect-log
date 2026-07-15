import type { ProcessStep as ProcessStepData } from "../content/marketingContent";

interface ProcessStepProps {
  step: ProcessStepData;
}

/** A single stage in the "How it works" timeline. */
export function ProcessStep({ step }: ProcessStepProps) {
  const Icon = step.icon;
  return (
    <div className="relative flex flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-marketing-navy text-white">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-heading text-sm font-bold tracking-widest text-marketing-primary">
          {step.number}
        </span>
      </div>
      <h3 className="font-heading text-lg font-semibold text-marketing-text">{step.title}</h3>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-marketing-text-secondary">
        {step.description}
      </p>
    </div>
  );
}
