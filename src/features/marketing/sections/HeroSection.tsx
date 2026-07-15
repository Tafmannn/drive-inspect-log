import { CheckCircle2 } from "lucide-react";
import { MarketingButton } from "../components/MarketingButton";
import { AppPreview } from "../components/AppPreview";
import { heroProofPoints } from "../content/marketingContent";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

export function HeroSection() {
  const { track } = useMarketingAnalytics();
  return (
    <section className="relative overflow-hidden bg-marketing-hero">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_55%_at_85%_-5%,hsl(var(--marketing-accent)/0.22),transparent)]"
      />
      <div className="relative mx-auto grid max-w-content items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-marketing-electric">
            UK-wide driven vehicle logistics
          </p>
          <h1 className="font-heading text-[clamp(2.5rem,6vw,4.75rem)] font-bold leading-[1.04] tracking-tight text-white">
            Vehicle movement without the blind spots.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-marketing-on-dark-muted">
            Professional vehicle collections and deliveries supported by documented inspections,
            photographic evidence and dependable proof of delivery.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingButton
              to="/contact"
              variant="primary"
              size="lg"
              onClick={() => track("marketing_cta_clicked", { cta: "request_movement", location: "hero" })}
            >
              Request a vehicle movement
            </MarketingButton>
            <MarketingButton
              to="/home"
              variant="outlineOnDark"
              size="lg"
              onClick={() => {
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                track("marketing_cta_clicked", { cta: "how_it_works", location: "hero" });
              }}
            >
              See how Axentra works
            </MarketingButton>
          </div>

          <ul className="mt-10 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {heroProofPoints.map((point) => (
              <li key={point} className="flex items-center gap-2 text-sm text-marketing-on-dark-muted">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-marketing-success" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:pl-6">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
