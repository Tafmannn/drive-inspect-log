import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "../components/BrandLogo";
import { MarketingButton } from "../components/MarketingButton";
import { MobileNavigation } from "./MobileNavigation";
import { primaryNav } from "../content/marketingContent";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

interface MarketingHeaderProps {
  /** When true, the header is transparent at the top of the page (over a hero). */
  transparentAtTop?: boolean;
}

export function MarketingHeader({ transparentAtTop = false }: MarketingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const { track } = useMarketingAnalytics();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || !transparentAtTop;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        solid
          ? "border-b border-white/10 bg-marketing-navy/95 backdrop-blur supports-[backdrop-filter]:bg-marketing-navy/80"
          // At the top, match the announcement bar's dark so the two read as one
          // seamless bar over the navy hero (keeps the white logo/nav legible).
          : "bg-marketing-bg-dark",
      )}
    >
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          to="/home"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
          aria-label="Axentra Vehicle Logistics — home"
        >
          <BrandLogo tone="dark" />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((link) => {
              const active = pathname === link.to && !link.homeAnchor;
              return (
                <li key={link.to + link.label}>
                  <Link
                    to={link.homeAnchor ? `${link.to}#${link.homeAnchor}` : link.to}
                    aria-current={active ? "page" : undefined}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:text-white aria-[current=page]:text-marketing-electric"
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <MarketingButton
            to="/login"
            variant="ghost"
            className="hidden text-white hover:bg-white/10 sm:inline-flex"
            onClick={() => track("login_clicked_from_marketing", { source: "header" })}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
          </MarketingButton>
          <MarketingButton to="/contact" variant="primary" className="hidden sm:inline-flex">
            Request a movement
          </MarketingButton>
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
