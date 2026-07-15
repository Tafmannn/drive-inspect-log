import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Slim top strip. Kept intentionally simple and easy to remove/repurpose for
 * service updates or recruitment later.
 */
export function AnnouncementBar() {
  return (
    <div className="bg-marketing-bg-dark text-marketing-on-dark">
      <div className="mx-auto flex max-w-content items-center justify-center gap-2 px-4 py-2 text-center text-[0.8rem] sm:text-sm">
        <span className="text-marketing-on-dark-muted">
          Professional driven vehicle movements across the UK
        </span>
        <Link
          to="/contact"
          className="group inline-flex items-center gap-1 font-semibold text-marketing-electric hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
        >
          Request a movement
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
