import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";

interface MarketingPageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumb?: { name: string; path: string }[];
  actions?: ReactNode;
}

/**
 * Navy hero band for interior marketing pages — sits directly beneath the solid
 * header and carries the page's single <h1> and (optionally) breadcrumbs/CTAs.
 */
export function MarketingPageShell({
  eyebrow,
  title,
  description,
  breadcrumb,
  actions,
}: MarketingPageShellProps) {
  return (
    <section className="relative overflow-hidden bg-marketing-hero">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_0%,hsl(var(--marketing-accent)/0.18),transparent)]"
      />
      <div className="relative mx-auto max-w-content px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8">
        {breadcrumb && (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-marketing-on-dark-muted">
              {breadcrumb.map((crumb, i) => (
                <li key={crumb.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                  {i < breadcrumb.length - 1 ? (
                    <Link
                      to={crumb.path}
                      className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
                    >
                      {crumb.name}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-white">
                      {crumb.name}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <SectionHeading as="h1" tone="dark" eyebrow={eyebrow} title={title} description={description} />
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  );
}
