import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Service } from "../content/marketingContent";

interface ServiceCardProps {
  service: Service;
  /** When set, the whole card links to the services page. */
  to?: string;
  className?: string;
}

export function ServiceCard({ service, to, className }: ServiceCardProps) {
  const Icon = service.icon;
  const inner = (
    <>
      <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-marketing-primary/10 text-marketing-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="font-heading text-xl font-semibold text-marketing-text">{service.title}</h3>
      <p className="mt-2.5 text-[0.975rem] leading-relaxed text-marketing-text-secondary">
        {service.short}
      </p>
      {to && (
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-marketing-primary">
          Learn more
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      )}
    </>
  );

  const base = cn(
    "group flex flex-col rounded-2xl border border-marketing-border bg-white p-7 shadow-marketing-sm transition-all",
    to && "hover:-translate-y-1 hover:border-marketing-primary/30 hover:shadow-marketing-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric",
    className,
  );

  if (to) {
    return (
      <Link to={to} className={base} aria-label={service.title}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
