import { CheckCircle2, FileCheck2 } from "lucide-react";
import { MarketingButton } from "../components/MarketingButton";
import { Photo } from "../components/Photo";
import { RouteMotif } from "../components/RouteMotif";
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
      <div className="relative mx-auto grid max-w-content items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:pb-28 lg:pt-24">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-marketing-electric">
            UK-wide driven vehicle logistics
          </p>
          <h1 className="font-heading text-[clamp(2.5rem,6vw,4.75rem)] font-extrabold leading-[1.03] tracking-tight text-white">
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

        <div className="relative">
          <Photo
            src="/img/hero.jpg"
            alt="Axentra staff inspecting a vehicle at a UK dealership"
            ratio="3/2"
            rounded="3xl"
            priority
            overlay
          />
          {/* route line + proof-of-delivery chip layered for the "documented" story */}
          <div className="pointer-events-none absolute inset-x-6 bottom-6 hidden sm:block">
            <RouteMotif className="max-h-12 opacity-90" />
          </div>
          <div className="absolute -bottom-5 -left-4 flex items-center gap-3 rounded-2xl border border-marketing-border bg-white/95 p-3.5 shadow-marketing-lg backdrop-blur sm:-left-6">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-marketing-success/15 text-marketing-success">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="pr-1">
              <span className="block text-xs font-medium text-marketing-text-muted">Every delivery</span>
              <span className="block text-sm font-semibold text-marketing-text">Proof of delivery ready</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
