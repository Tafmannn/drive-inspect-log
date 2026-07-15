import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, LogIn } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { MarketingButton } from "../components/MarketingButton";
import { BrandLogo } from "../components/BrandLogo";
import { primaryNav } from "../content/marketingContent";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

/** Accessible mobile drawer navigation (Radix Dialog via shadcn Sheet). */
export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { track } = useMarketingAnalytics();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-[88vw] max-w-sm flex-col border-marketing-navy-elevated bg-marketing-navy p-0 text-white"
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-white/10 p-5 text-left">
          <SheetTitle asChild>
            <span>
              <BrandLogo tone="dark" />
            </span>
          </SheetTitle>
          <SheetClose asChild>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </SheetClose>
        </SheetHeader>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto p-5">
          <ul className="space-y-1">
            {primaryNav.map((link) => {
              const active = pathname === link.to;
              return (
                <li key={link.to + link.label}>
                  <Link
                    to={link.homeAnchor ? `${link.to}#${link.homeAnchor}` : link.to}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="block rounded-lg px-4 py-3 text-lg font-medium text-white hover:bg-white/10 aria-[current=page]:bg-white/10 aria-[current=page]:text-marketing-electric"
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-white/10 p-5">
          <MarketingButton
            to="/contact"
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Request a vehicle movement
          </MarketingButton>
          <MarketingButton
            to="/login"
            variant="outlineOnDark"
            size="lg"
            className="w-full"
            onClick={() => {
              track("login_clicked_from_marketing", { source: "mobile_nav" });
              setOpen(false);
            }}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
          </MarketingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
