import { MapPin, Clock, ShieldCheck } from "lucide-react";
import { SITE } from "../content/marketingContent";

/** Compact coverage / basics panel for the contact page. */
export function CoveragePanel() {
  const items = [
    { key: "base", icon: MapPin, label: "Based in", value: SITE.base },
    { key: "coverage", icon: MapPin, label: "Coverage", value: "UK-wide driven movements" },
    { key: "response", icon: Clock, label: "Response", value: "We aim to respond to enquiries promptly during business hours" },
    { key: "insured", icon: ShieldCheck, label: "Insurance", value: "Road Risk and Public Liability cover, subject to policy terms" },
  ];
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.key} className="flex gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marketing-primary/10 text-marketing-primary">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-marketing-text-muted">
                {item.label}
              </p>
              <p className="text-sm text-marketing-text">{item.value}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
