import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { Photo } from "../components/Photo";

export function AboutPreviewSection() {
  return (
    <MarketingSection tone="navy" labelledBy="about-heading">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div data-reveal>
          <SectionHeading
            id="about-heading"
            eyebrow="About Axentra"
            title="Built from hands-on vehicle movement experience."
            description="Axentra was created from direct experience across dealership, auction, rental and leasing movements. The business is being built around a simple belief: vehicle logistics should be easier to manage, easier to verify and more professional for everyone involved."
            tone="dark"
          />
          <p className="mt-5 max-w-xl text-marketing-on-dark-muted">
            By combining experienced movement operations with purpose-built digital workflows,
            Axentra gives automotive businesses a clearer and more dependable service — precision in
            every move.
          </p>
          <MarketingButton to="/about" variant="outlineOnDark" size="lg" className="mt-8">
            Discover the Axentra story
          </MarketingButton>
        </div>

        <div data-reveal>
          <Photo
            src="/img/team.jpg"
            alt="Axentra staff reviewing a vehicle movement on a tablet"
            ratio="3/2"
            rounded="3xl"
          />
        </div>
      </div>
    </MarketingSection>
  );
}
