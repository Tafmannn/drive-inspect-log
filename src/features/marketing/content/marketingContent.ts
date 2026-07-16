/**
 * Single source of truth for all Axentra marketing copy.
 *
 * Keep wording here (not inline in components) so pages stay consistent and copy
 * edits happen in one place. Everything is typed; lists use stable string keys.
 *
 * TRUTHFULNESS: no invented stats, client logos, testimonials, review scores or
 * capabilities. Axentra provides DRIVEN vehicle movements only — never transporter.
 *
 * ⚠️ CONTACT DETAILS below are placeholders pending verification. Replace the
 * email/phone/registered-office values with confirmed details before launch
 * (see docs/marketing/ASSET_REQUIREMENTS.md).
 */
import {
  ClipboardCheck,
  Truck,
  Camera,
  PenLine,
  ShieldCheck,
  Building2,
  Warehouse,
  Gavel,
  CarFront,
  RefreshCw,
  MapPin,
  FileCheck2,
  Route as RouteIcon,
  ClipboardList,
  Send,
  BadgeCheck,
  Radio,
  History,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavLink {
  label: string;
  to: string;
  /** Set for in-page anchors that live on the homepage. */
  homeAnchor?: string;
}

export interface Service {
  key: string;
  slug: string;
  title: string;
  short: string;
  icon: LucideIcon;
  /** Longer detail bullets shown on the Services page. */
  detail: string[];
}

export interface ProcessStep {
  key: string;
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface TechFeature {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface Faq {
  key: string;
  question: string;
  answer: string;
}

export interface CustomerType {
  key: string;
  label: string;
  icon: LucideIcon;
}

/* ── Company / site constants ─────────────────────────────────────────── */

export const SITE = {
  name: "Axentra Vehicle Logistics",
  shortName: "Axentra",
  /** Public canonical origin — update if the production domain differs. */
  origin: "https://axentravehicles.co.uk",
  base: "Leeds, United Kingdom",
  coverage: "UK-wide",
  // ⚠️ Placeholder — verify before launch.
  contactEmail: "enquiries@axentravehicles.co.uk",
  /** Registered brand tagline. */
  tagline: "Precision in every move.",
  promise: "Every vehicle. Every handover. Clearly documented.",
} as const;

/* ── Navigation ───────────────────────────────────────────────────────── */

export const primaryNav: NavLink[] = [
  { key: "services", label: "Services", to: "/services" },
  { key: "how", label: "How it works", to: "/home", homeAnchor: "how-it-works" },
  { key: "technology", label: "Technology", to: "/technology" },
  { key: "about", label: "About", to: "/about" },
  { key: "contact", label: "Contact", to: "/contact" },
].map((n) => ({ label: n.label, to: n.to, homeAnchor: n.homeAnchor }));

/* ── Hero proof points ────────────────────────────────────────────────── */

export const heroProofPoints: string[] = [
  "UK-wide coverage",
  "Driven vehicle movements",
  "Digital condition reporting",
  "Photo evidence",
  "Proof of delivery",
  "Insured operations",
];

/* ── Customer categories ──────────────────────────────────────────────── */

export const customerTypes: CustomerType[] = [
  { key: "dealerships", label: "Dealerships", icon: Building2 },
  { key: "groups", label: "Dealer groups", icon: Building2 },
  { key: "fleet", label: "Fleet operators", icon: CarFront },
  { key: "rental", label: "Rental companies", icon: RefreshCw },
  { key: "leasing", label: "Leasing providers", icon: FileCheck2 },
  { key: "auctions", label: "Auctions", icon: Gavel },
  { key: "remarketing", label: "Remarketing businesses", icon: Warehouse },
  { key: "trade", label: "Automotive trade", icon: Truck },
];

/* ── Services ─────────────────────────────────────────────────────────── */

export const services: Service[] = [
  {
    key: "dealer-to-customer",
    slug: "dealer-to-customer-delivery",
    title: "Dealer-to-customer delivery",
    short: "Professional final-mile vehicle delivery with a documented, customer-friendly handover.",
    icon: Truck,
    detail: [
      "Final-mile delivery to the customer’s address",
      "Structured, professional handover",
      "Mileage recorded at delivery",
      "Condition confirmed with photographs",
      "Customer signature captured where applicable",
      "Proof of delivery produced for the record",
    ],
  },
  {
    key: "customer-to-dealer",
    slug: "customer-to-dealer-collection",
    title: "Customer-to-dealer collection",
    short: "Collection of part-exchange, purchased, returned or transferred vehicles from customer locations.",
    icon: CarFront,
    detail: [
      "Part-exchange and purchased-vehicle collections",
      "Returns and end-of-lease collections where agreed",
      "Collection condition evidence captured up front",
      "Keys and document confirmation",
      "Clear communication with the collection contact",
    ],
  },
  {
    key: "dealer-transfers",
    slug: "dealer-and-group-transfers",
    title: "Dealer and group transfers",
    short: "Movements between dealership branches, preparation centres, storage sites and operating locations.",
    icon: Building2,
    detail: [
      "Branch-to-branch transfers",
      "Movements to and from preparation centres",
      "Storage and body-shop movements",
      "Consistent condition records between sites",
    ],
  },
  {
    key: "auction-remarketing",
    slug: "auction-and-remarketing-movements",
    title: "Auction and remarketing movements",
    short: "Collection and delivery supporting vehicle purchasing, disposal, resale and remarketing activity.",
    icon: Gavel,
    detail: [
      "Auction purchase collections",
      "Dealer disposal and remarketing movements",
      "Condition documentation at collection",
      "Collection-timing coordination",
    ],
  },
  {
    key: "fleet-leasing",
    slug: "rental-leasing-and-fleet-movements",
    title: "Rental, leasing and fleet movements",
    short: "Vehicle repositioning, return, replacement and operational transfer support.",
    icon: RefreshCw,
    detail: [
      "Repositioning across locations",
      "Returns and replacement vehicles",
      "Branch and operational transfers",
      "Support for recurring requirements",
    ],
  },
  {
    key: "inspection-pod",
    slug: "inspection-and-proof-of-delivery",
    title: "Inspection and proof of delivery",
    short: "Condition records, photographs, mileage, signatures and digital movement evidence.",
    icon: ClipboardCheck,
    detail: [
      "Structured condition capture",
      "Timestamped photographs",
      "Mileage and document confirmation",
      "Signatures and digital proof of delivery",
      "Administrative review of completeness",
    ],
  },
];

/* ── Problem / solution pillars ───────────────────────────────────────── */

export const solutionPillars = [
  {
    key: "before",
    title: "Clear before collection",
    description:
      "Job details, addresses, contacts and movement requirements are organised before the driver begins.",
    icon: ClipboardList,
  },
  {
    key: "during",
    title: "Documented during handover",
    description:
      "Vehicle condition, mileage, photographs, signatures and relevant documents are captured through a structured inspection process.",
    icon: Camera,
  },
  {
    key: "after",
    title: "Confirmed after delivery",
    description:
      "Delivery details and final evidence create a clearer record of what happened and when.",
    icon: BadgeCheck,
  },
] as const;

/* ── How it works ─────────────────────────────────────────────────────── */

export const processSteps: ProcessStep[] = [
  {
    key: "details",
    number: "01",
    title: "Send the movement details",
    description:
      "Provide the collection location, delivery location, vehicle information, contacts and preferred date.",
    icon: Send,
  },
  {
    key: "coordinate",
    number: "02",
    title: "Axentra coordinates the job",
    description:
      "The movement is reviewed, organised and prepared with the relevant collection and delivery instructions.",
    icon: ClipboardList,
  },
  {
    key: "inspect",
    number: "03",
    title: "The vehicle is inspected and moved",
    description:
      "The driver records the vehicle’s condition before completing the journey professionally and safely.",
    icon: ClipboardCheck,
  },
  {
    key: "documented",
    number: "04",
    title: "Delivery is documented",
    description:
      "Delivery details, condition evidence and signatures are captured to create a dependable proof-of-delivery record.",
    icon: FileCheck2,
  },
];

/* ── Technology features (customer value, not implementation) ──────────── */

export const techFeatures: TechFeature[] = [
  { key: "inspections", label: "Structured collection inspections", icon: ClipboardCheck },
  { key: "condition", label: "Vehicle condition records", icon: FileCheck2 },
  { key: "photos", label: "Timestamped photographs", icon: Camera },
  { key: "damage", label: "Damage documentation", icon: ClipboardList },
  { key: "mileage", label: "Mileage confirmation", icon: RouteIcon },
  { key: "documents", label: "Document checks", icon: FileCheck2 },
  { key: "signatures", label: "Customer signatures", icon: PenLine },
  { key: "pod", label: "Digital proof of delivery", icon: BadgeCheck },
  { key: "review", label: "Administrative review", icon: UserCheck },
  { key: "history", label: "Secure movement history", icon: History },
];

export const techLifecycle: string[] = [
  "Movement created",
  "Driver assigned",
  "Collection inspection",
  "Vehicle in transit",
  "Delivery inspection",
  "Signature captured",
  "Evidence reviewed",
  "Proof of delivery available",
];

/* ── Evidence benefits ────────────────────────────────────────────────── */

export const evidenceBenefits: string[] = [
  "Easier internal review",
  "Clearer customer communication",
  "Better handover records",
  "Reduced reliance on scattered messages",
  "A consistent evidence format",
];

/* ── Trust points (defensible statements only) ────────────────────────── */

export const trustPoints = [
  { key: "road-risk", label: "Road Risk insured", icon: ShieldCheck },
  { key: "public-liability", label: "Public Liability insured", icon: ShieldCheck },
  { key: "inspections", label: "Structured inspections", icon: ClipboardCheck },
  { key: "documented", label: "Documented collection and delivery", icon: FileCheck2 },
  { key: "communication", label: "Clear customer communication", icon: Radio },
  { key: "evidence", label: "Digital movement evidence", icon: Camera },
  { key: "handovers", label: "Professional handovers", icon: PenLine },
  { key: "uk-wide", label: "UK-wide driven movements", icon: MapPin },
] as const;

export const insuranceQualifier =
  "Insurance cover is subject to policy terms, conditions and vehicle eligibility. Details are available on request.";

/* ── Standards that back every movement (service credibility, not hiring) ── */

export const movementStandards: string[] = [
  "Professional, vetted drivers",
  "Structured collection inspections",
  "Consistent photographic evidence",
  "Clear customer communication",
  "Careful vehicle handling",
  "Dependable proof of delivery",
];

/* ── FAQs ─────────────────────────────────────────────────────────────── */

export const faqs: Faq[] = [
  {
    key: "types",
    question: "What types of vehicle movements does Axentra provide?",
    answer:
      "Axentra provides professional driven vehicle collection and delivery services for dealerships, dealer groups, fleets, rental and leasing businesses, auctions and automotive trade customers — from single deliveries to recurring movements.",
  },
  {
    key: "transporter",
    question: "Does Axentra transport vehicles on a lorry?",
    answer:
      "No. Axentra currently specialises in driven vehicle movements and does not currently offer transporter services. Non-running vehicles normally require alternative transport.",
  },
  {
    key: "coverage",
    question: "Which areas do you cover?",
    answer:
      "Axentra provides UK-wide coverage, subject to driver availability, vehicle suitability and movement requirements.",
  },
  {
    key: "inspection",
    question: "What information is recorded during an inspection?",
    answer:
      "Depending on the service, inspections can capture visible condition, mileage, photographs, damage notes, relevant vehicle documents and signatures.",
  },
  {
    key: "pod",
    question: "Will I receive proof of delivery?",
    answer:
      "Completed movement records can include delivery confirmation, photographs, mileage, condition notes and signatures, depending on the service agreed.",
  },
  {
    key: "recurring",
    question: "Can Axentra support recurring movements?",
    answer:
      "Yes. Recurring and account-based requirements can be discussed — get in touch with the details of what you need moved and how often.",
  },
  {
    key: "quote",
    question: "How do I request a quotation?",
    answer:
      "Use the online movement request form with the collection and delivery locations, vehicle information and preferred date. Axentra reviews the details and responds with availability and pricing.",
  },
  {
    key: "confirmed",
    question: "Is submitting a request a confirmed booking?",
    answer:
      "No. A booking is only confirmed once Axentra reviews the request and explicitly confirms availability and pricing in writing.",
  },
  {
    key: "insured",
    question: "Are vehicle movements insured?",
    answer:
      "Axentra operates with Road Risk and Public Liability cover, subject to policy terms, conditions and vehicle eligibility. Details are available on request.",
  },
];

/* ── Footer navigation ────────────────────────────────────────────────── */

export interface FooterColumn {
  key: string;
  heading: string;
  links: { label: string; to: string; homeAnchor?: string }[];
}

export const footerColumns: FooterColumn[] = [
  {
    key: "services",
    heading: "Services",
    links: [
      { label: "Vehicle delivery", to: "/services" },
      { label: "Vehicle collection", to: "/services" },
      { label: "Dealer transfers", to: "/services" },
      { label: "Auction movements", to: "/services" },
      { label: "Fleet and leasing movements", to: "/services" },
      { label: "Inspection and proof of delivery", to: "/services" },
    ],
  },
  {
    key: "company",
    heading: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Technology", to: "/technology" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    key: "account",
    heading: "Account",
    links: [
      { label: "Sign in", to: "/login" },
      { label: "Request a movement", to: "/contact" },
    ],
  },
  {
    key: "legal",
    heading: "Legal",
    links: [
      { label: "Privacy policy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Cookie policy", to: "/cookies" },
      { label: "Accessibility statement", to: "/accessibility" },
    ],
  },
];
