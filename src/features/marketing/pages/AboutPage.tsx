import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { SectionHeading } from "../components/SectionHeading";
import { MarketingButton } from "../components/MarketingButton";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { breadcrumbSchema, organizationSchema } from "../content/structuredData";

const principles = [
  "Care for every vehicle",
  "Document every important handover",
  "Communicate clearly",
  "Build systems that support people",
  "Improve through evidence",
  "Grow without lowering standards",
];

export function AboutPage() {
  usePageMeta(pageMeta.about, [
    organizationSchema(),
    breadcrumbSchema([
      { name: "Home", path: "/home" },
      { name: "About", path: "/about" },
    ]),
  ]);

  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="About Axentra"
        title="A vehicle logistics company being built differently."
        description="Axentra combines real vehicle movement experience with digital processes designed to improve evidence, communication and accountability."
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "About", path: "/about" },
        ]}
        image={{ src: "/img/team.jpg", alt: "Axentra staff reviewing a vehicle movement on a tablet" }}
      />

      <MarketingSection tone="light">
        <div className="grid gap-12 lg:grid-cols-2">
          <div data-reveal>
            <SectionHeading title="The problem" as="h2" />
            <p className="mt-4 text-marketing-text-secondary">
              Vehicle movements are often coordinated through fragmented calls, messages,
              spreadsheets and photographs. Important condition evidence ends up scattered, and
              handovers can be difficult to verify after the fact.
            </p>
          </div>
          <div data-reveal>
            <SectionHeading title="The idea" as="h2" />
            <p className="mt-4 text-marketing-text-secondary">
              Create a more consistent process around the real movement — professional driven
              collections and deliveries, supported by structured inspections and a dependable
              record from collection to delivery.
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection tone="muted">
        <div data-reveal>
          <SectionHeading
            eyebrow="Hands-on experience"
            title="Grounded in real vehicle movements"
            as="h2"
            description="Axentra comes from experience serving dealership, rental, leasing, auction and remarketing movements — the realities drivers, dealerships and customers face during collections and deliveries."
          />
        </div>
        <div data-reveal className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((p) => (
            <div
              key={p}
              className="rounded-xl border border-marketing-border bg-white p-5 font-medium text-marketing-text shadow-marketing-sm"
            >
              {p}
            </div>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection tone="light">
        <div data-reveal className="rounded-2xl border border-marketing-border bg-marketing-bg-light p-8 lg:p-12">
          <SectionHeading eyebrow="Founder" title="Built around the realities of the job" as="h2" />
          <p className="mt-4 max-w-3xl text-marketing-text-secondary">
            Founded by someone with direct experience completing vehicle movements, Axentra is
            designed around what drivers, dealerships and customers actually need during collections
            and deliveries. {/* Replace with verified founder details/photo before launch. */}
          </p>
        </div>
      </MarketingSection>

      <MarketingSection tone="navy">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div data-reveal>
            <SectionHeading
              eyebrow="Vision"
              title="A trusted UK vehicle logistics operation"
              as="h2"
              tone="dark"
              description="Axentra’s long-term goal is to build a trusted UK vehicle logistics operation where professional drivers, automotive businesses and digital evidence work together through one dependable process."
            />
          </div>
          <div data-reveal className="lg:justify-self-end">
            <MarketingButton to="/contact" variant="primary" size="lg">
              Work with Axentra
            </MarketingButton>
          </div>
        </div>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default AboutPage;
