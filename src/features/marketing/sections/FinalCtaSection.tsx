import { MarketingButton } from "../components/MarketingButton";
import { useSectionReveal } from "../hooks/useSectionReveal";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

export function FinalCtaSection() {
  const ref = useSectionReveal<HTMLElement>();
  const { track } = useMarketingAnalytics();
  return (
    <section ref={ref} aria-labelledby="final-cta-heading" className="bg-marketing-bg-dark">
      <div className="mx-auto max-w-content px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div
          data-reveal
          className="relative overflow-hidden rounded-3xl bg-marketing-hero px-8 py-14 text-center shadow-marketing-lg sm:px-12"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,hsl(var(--marketing-accent)/0.25),transparent)]"
          />
          <div className="relative mx-auto max-w-2xl">
            <h2
              id="final-cta-heading"
              className="font-heading text-[clamp(2rem,4vw,3rem)] font-bold leading-tight text-white"
            >
              A better way to move your vehicles starts here.
            </h2>
            <p className="mt-5 text-lg text-marketing-on-dark-muted">
              Tell us where the vehicle is, where it needs to go and when you would like it moved.
              Axentra will review the details and respond with availability and pricing.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <MarketingButton
                to="/contact"
                variant="primary"
                size="lg"
                onClick={() => track("marketing_cta_clicked", { cta: "request_movement", location: "final_cta" })}
              >
                Request a vehicle movement
              </MarketingButton>
              <MarketingButton to="/contact" variant="outlineOnDark" size="lg">
                Contact Axentra
              </MarketingButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
