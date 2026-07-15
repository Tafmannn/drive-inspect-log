import { CheckCircle2, Camera, FileCheck2, MapPin } from "lucide-react";
import { RouteMotif } from "./RouteMotif";

/**
 * Restrained interface composition for the hero. Built from real UI primitives
 * using SAFE SAMPLE DATA only (no real customer registrations or addresses). It
 * communicates "a vehicle is being moved and professionally documented" without
 * implying functionality that does not exist. Decorative — hidden from AT.
 */
const statuses = [
  { key: "inspection", label: "Collection inspection complete", icon: CheckCircle2 },
  { key: "evidence", label: "Evidence uploaded", icon: Camera },
  { key: "delivery", label: "Delivery confirmed", icon: MapPin },
  { key: "pod", label: "Proof of delivery available", icon: FileCheck2 },
];

export function AppPreview() {
  return (
    <div aria-hidden="true" className="relative select-none">
      <div className="rounded-3xl border border-white/10 bg-marketing-navy-elevated/80 p-5 shadow-marketing-lg backdrop-blur">
        {/* header row */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-marketing-on-dark-muted">
              Movement
            </p>
            <p className="font-heading text-lg font-semibold text-white">Leeds → Birmingham</p>
          </div>
          <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono text-sm font-semibold tracking-wider text-white">
            AX24 TRA
          </span>
        </div>

        {/* route */}
        <div className="py-4">
          <RouteMotif className="max-h-16" />
        </div>

        {/* status list */}
        <ul className="space-y-2.5">
          {statuses.map((s) => {
            const Icon = s.icon;
            return (
              <li
                key={s.key}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-marketing-success/15 text-marketing-success">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-white">{s.label}</span>
                <CheckCircle2 className="ml-auto h-4 w-4 text-marketing-success" />
              </li>
            );
          })}
        </ul>
      </div>

      {/* floating evidence chip */}
      <div className="absolute -bottom-5 -left-4 hidden rounded-2xl border border-marketing-border bg-white p-4 shadow-marketing-lg sm:block">
        <p className="text-xs font-medium text-marketing-text-muted">Mileage recorded</p>
        <p className="font-heading text-xl font-bold text-marketing-text">24,318</p>
      </div>
    </div>
  );
}
