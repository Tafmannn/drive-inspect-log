import { Mail, Users } from "lucide-react";
import { SITE } from "../content/marketingContent";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

/** Verified contact routes (email only — no fabricated phone number). */
export function ContactCard() {
  const { track } = useMarketingAnalytics();
  return (
    <div className="space-y-3">
      <a
        href={`mailto:${SITE.contactEmail}`}
        onClick={() => track("email_contact_clicked", { context: "contact_card" })}
        className="flex items-center gap-3 rounded-xl border border-marketing-border bg-white p-4 shadow-marketing-sm transition-colors hover:border-marketing-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-marketing-primary/10 text-marketing-primary">
          <Mail className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-marketing-text-muted">
            General enquiries
          </span>
          <span className="block text-sm font-medium text-marketing-text">{SITE.contactEmail}</span>
        </span>
      </a>
      <a
        href={`mailto:${SITE.driverEmail}`}
        onClick={() => track("email_contact_clicked", { context: "driver" })}
        className="flex items-center gap-3 rounded-xl border border-marketing-border bg-white p-4 shadow-marketing-sm transition-colors hover:border-marketing-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-electric"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-marketing-primary/10 text-marketing-primary">
          <Users className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-marketing-text-muted">
            Driver applications
          </span>
          <span className="block text-sm font-medium text-marketing-text">{SITE.driverEmail}</span>
        </span>
      </a>
    </div>
  );
}
