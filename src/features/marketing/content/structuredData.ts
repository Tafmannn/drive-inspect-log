import { SITE, services, faqs, type Faq } from "./marketingContent";

/**
 * JSON-LD builders. Only schemas backed by real, defensible information are
 * produced — no Review or AggregateRating (Axentra has no verified reviews).
 */

export function organizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: `${SITE.origin}/home`,
    logo: `${SITE.origin}/axentra-logo.png`,
    description:
      "Professional driven vehicle collections and deliveries across the UK, supported by documented inspections, photographic evidence and proof of delivery.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Leeds",
      addressCountry: "GB",
    },
    email: SITE.contactEmail,
    areaServed: { "@type": "Country", name: "United Kingdom" },
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: `${SITE.origin}/home`,
  };
}

export function professionalServiceSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: SITE.name,
    url: `${SITE.origin}/home`,
    areaServed: { "@type": "Country", name: "United Kingdom" },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Leeds",
      addressCountry: "GB",
    },
    serviceType: "Driven vehicle logistics",
    email: SITE.contactEmail,
  };
}

export function servicesSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: services.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: s.title,
        description: s.short,
        provider: { "@type": "Organization", name: SITE.name },
        areaServed: { "@type": "Country", name: "United Kingdom" },
      },
    })),
  };
}

export function faqSchema(items: Faq[] = faqs): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function breadcrumbSchema(
  trail: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE.origin}${t.path}`,
    })),
  };
}
