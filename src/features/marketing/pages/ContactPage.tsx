import { Info } from "lucide-react";
import { MarketingLayout } from "../layout/MarketingLayout";
import { MarketingPageShell } from "../layout/MarketingPageShell";
import { MarketingSection } from "../components/MarketingSection";
import { QuoteForm } from "../components/QuoteForm";
import { CoveragePanel } from "../components/CoveragePanel";
import { ContactCard } from "../components/ContactCard";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import { breadcrumbSchema, professionalServiceSchema } from "../content/structuredData";

export function ContactPage() {
  usePageMeta(pageMeta.contact, [
    professionalServiceSchema(),
    breadcrumbSchema([
      { name: "Home", path: "/home" },
      { name: "Contact", path: "/contact" },
    ]),
  ]);

  return (
    <MarketingLayout>
      <MarketingPageShell
        eyebrow="Contact Axentra"
        title="Tell us about the vehicle you need moved."
        description="Provide the collection, delivery and vehicle details. Axentra will review the request and respond with availability and pricing."
        breadcrumb={[
          { name: "Home", path: "/home" },
          { name: "Contact", path: "/contact" },
        ]}
      />

      <MarketingSection tone="muted">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <div data-reveal className="order-2 rounded-2xl border border-marketing-border bg-white p-6 shadow-marketing-sm sm:p-8 lg:order-1">
            <h2 className="font-heading text-2xl font-bold text-marketing-text">Movement request</h2>
            <p className="mt-1.5 text-sm text-marketing-text-secondary">
              Fields marked <span className="text-destructive">*</span> are required.
            </p>
            <div className="mt-6">
              <QuoteForm />
            </div>
          </div>

          <aside className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-24">
            <div data-reveal className="flex gap-3 rounded-xl border border-marketing-primary/20 bg-marketing-primary/5 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-marketing-primary" aria-hidden="true" />
              <p className="text-sm text-marketing-text-secondary">
                Submitting this form does not confirm a booking. Please wait for written confirmation
                from Axentra before making arrangements around the movement.
              </p>
            </div>
            <div data-reveal className="rounded-2xl border border-marketing-border bg-white p-6 shadow-marketing-sm">
              <h2 className="font-heading text-lg font-semibold text-marketing-text">Get in touch</h2>
              <div className="mt-4">
                <ContactCard />
              </div>
              <hr className="my-6 border-marketing-border" />
              <CoveragePanel />
            </div>
          </aside>
        </div>
      </MarketingSection>
    </MarketingLayout>
  );
}

export default ContactPage;
