import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MarketingLayout } from "../layout/MarketingLayout";
import { HeroSection } from "../sections/HeroSection";
import { CustomerTypesSection } from "../sections/CustomerTypesSection";
import { ProblemSolutionSection } from "../sections/ProblemSolutionSection";
import { ServicesSection } from "../sections/ServicesSection";
import { ProcessSection } from "../sections/ProcessSection";
import { TechnologySection } from "../sections/TechnologySection";
import { EvidenceSection } from "../sections/EvidenceSection";
import { TrustSection } from "../sections/TrustSection";
import { AboutPreviewSection } from "../sections/AboutPreviewSection";
import { DriverNetworkSection } from "../sections/DriverNetworkSection";
import { FaqSection } from "../sections/FaqSection";
import { FinalCtaSection } from "../sections/FinalCtaSection";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageMeta } from "../content/pageMetadata";
import {
  organizationSchema,
  websiteSchema,
  professionalServiceSchema,
  faqSchema,
} from "../content/structuredData";

export function MarketingHome() {
  usePageMeta(pageMeta.home, [
    organizationSchema(),
    websiteSchema(),
    professionalServiceSchema(),
    faqSchema(),
  ]);

  // Smooth-scroll to an in-page anchor when arriving via /home#how-it-works.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      // Defer so layout has settled before scrolling.
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth" }));
    }
  }, [hash]);

  return (
    <MarketingLayout transparentHeader>
      <HeroSection />
      <CustomerTypesSection />
      <ProblemSolutionSection />
      <ServicesSection />
      <ProcessSection />
      <TechnologySection />
      <EvidenceSection />
      <TrustSection />
      <AboutPreviewSection />
      <DriverNetworkSection />
      <FaqSection />
      <FinalCtaSection />
    </MarketingLayout>
  );
}

export default MarketingHome;
