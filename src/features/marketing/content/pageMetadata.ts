import { SITE } from "./marketingContent";

export interface PageMeta {
  title: string;
  description: string;
  /** Path (leading slash) used to build the canonical URL. */
  path: string;
}

/** Canonical homepage lives at /home (root `/` dynamically serves app or marketing). */
export const pageMeta = {
  home: {
    title: "Axentra Vehicle Logistics | UK-Wide Driven Vehicle Movements",
    description:
      "Professional driven vehicle collections and deliveries across the UK, supported by documented inspections, photographic evidence and dependable proof of delivery.",
    path: "/home",
  },
  services: {
    title: "Driven Vehicle Movement Services | Axentra",
    description:
      "Dealer deliveries, collections, transfers, auction and fleet movements — professional driven vehicle logistics with structured inspections and proof of delivery.",
    path: "/services",
  },
  technology: {
    title: "Vehicle Movement Inspections and Digital POD | Axentra",
    description:
      "The Axentra platform organises movement details, guides inspections, captures evidence and creates dependable proof of delivery for every vehicle movement.",
    path: "/technology",
  },
  about: {
    title: "About Axentra Vehicle Logistics",
    description:
      "Axentra combines hands-on vehicle movement experience with digital processes designed to improve evidence, communication and accountability across the UK.",
    path: "/about",
  },
  contact: {
    title: "Request a Vehicle Movement | Axentra",
    description:
      "Tell Axentra about the vehicle you need moved. Provide collection, delivery and vehicle details and we will review the request and respond with availability and pricing.",
    path: "/contact",
  },
  privacy: {
    title: "Privacy Policy | Axentra Vehicle Logistics",
    description: `How ${SITE.name} collects, uses and protects information submitted through this website.`,
    path: "/privacy",
  },
  terms: {
    title: "Terms of Website Use | Axentra Vehicle Logistics",
    description: `The terms that apply to your use of the ${SITE.name} website and enquiry forms.`,
    path: "/terms",
  },
  cookies: {
    title: "Cookie Policy | Axentra Vehicle Logistics",
    description: `How ${SITE.name} uses cookies and similar technologies on this website.`,
    path: "/cookies",
  },
  accessibility: {
    title: "Accessibility Statement | Axentra Vehicle Logistics",
    description: `${SITE.name}'s commitment to making this website accessible, and how to give feedback.`,
    path: "/accessibility",
  },
} satisfies Record<string, PageMeta>;

export type PageMetaKey = keyof typeof pageMeta;
