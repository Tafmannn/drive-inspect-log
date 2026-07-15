import type { ReactNode } from "react";
import { AnnouncementBar } from "./AnnouncementBar";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";

interface MarketingLayoutProps {
  children: ReactNode;
  /** True on the homepage so the header sits transparently over the hero. */
  transparentHeader?: boolean;
}

/**
 * Shared chrome for every public marketing page: skip link, announcement bar,
 * sticky header, main landmark and footer. Applies `.marketing-root` so the
 * marketing typography/reveal tokens apply here and nowhere in the app.
 */
export function MarketingLayout({ children, transparentHeader = false }: MarketingLayoutProps) {
  return (
    <div className="marketing-root min-h-dvh bg-marketing-bg-light text-marketing-text">
      <a href="#main-content" className="marketing-skip-link">
        Skip to content
      </a>
      <AnnouncementBar />
      <MarketingHeader transparentAtTop={transparentHeader} />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </div>
  );
}
