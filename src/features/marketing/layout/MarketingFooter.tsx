import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { footerColumns, SITE } from "../content/marketingContent";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-marketing-bg-dark text-marketing-on-dark">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <BrandLogo tone="dark" />
            <p className="mt-4 text-sm leading-relaxed text-marketing-on-dark-muted">
              Professional driven vehicle collections and deliveries across the UK, supported by
              documented inspections, photographic evidence and dependable proof of delivery.
            </p>
            <p className="mt-4 text-xs text-marketing-on-dark-muted">
              Driven vehicle movement services. Transporter services are not currently offered.
            </p>
          </div>

          {footerColumns.map((col) => (
            <nav key={col.key} aria-label={col.heading}>
              <h2 className="font-heading text-sm font-semibold text-white">{col.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={`${col.key}-${link.label}`}>
                    <Link
                      to={link.to}
                      className="text-sm text-marketing-on-dark-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-marketing-on-dark-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {SITE.name}. All rights reserved.</p>
          <p>{SITE.base} · UK-wide coverage</p>
        </div>
      </div>
    </footer>
  );
}
