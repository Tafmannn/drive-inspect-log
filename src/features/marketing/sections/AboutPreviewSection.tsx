import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";

export function AboutPreviewSection() {
  return (
    <MarketingSection tone="navy" labelledBy="about-heading">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div data-reveal>
          <SectionHeading
            id="about-heading"
            eyebrow="About Axentra"
            title="Built from hands-on vehicle movement experience."
            description="Axentra was created from direct experience across dealership, auction, rental and leasing movements. The business is being built around a simple belief: vehicle logistics should be easier to manage, easier to verify and more professional for everyone involved."
            tone="dark"
          />
          <MarketingButton to="/about" variant="outlineOnDark" size="lg" className="mt-8">
            Discover the Axentra story
          </MarketingButton>
        </div>

        <div data-reveal className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <p className="text-lg leading-relaxed text-marketing-on-dark-muted">
            By combining experienced movement operations with purpose-built digital workflows,
            Axentra aims to give automotive businesses a clearer and more dependable service.
          </p>
        </div>
      </div>
    </MarketingSection>
  );
}
