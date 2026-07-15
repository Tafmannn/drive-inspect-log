import { Camera, PenLine, FileCheck2, CheckCircle2 } from "lucide-react";

/**
 * Movement-record / evidence document preview. Safe sample data only — never
 * real customer registrations, names or addresses. Decorative — hidden from AT.
 */
const rows: { key: string; label: string; value: string }[] = [
  { key: "reg", label: "Registration", value: "AX24 TRA" },
  { key: "vehicle", label: "Vehicle", value: "Example hatchback" },
  { key: "collection", label: "Collection", value: "Leeds · 08:40" },
  { key: "delivery", label: "Delivery", value: "Birmingham · 11:15" },
  { key: "mileage", label: "Mileage", value: "24,318" },
  { key: "condition", label: "Condition", value: "Recorded" },
];

const evidenceCategories = ["Front", "Rear", "Nearside", "Offside", "Interior", "Odometer"];

export function EvidencePreview() {
  return (
    <div aria-hidden="true" className="select-none rounded-3xl border border-marketing-border bg-white p-6 shadow-marketing-lg">
      <div className="flex items-center justify-between border-b border-marketing-border pb-4">
        <p className="font-heading text-base font-semibold text-marketing-text">Movement record</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-marketing-success/10 px-3 py-1 text-xs font-semibold text-marketing-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> POD ready
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map((r) => (
          <div key={r.key}>
            <dt className="text-xs font-medium text-marketing-text-muted">{r.label}</dt>
            <dd className="text-sm font-semibold text-marketing-text">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-marketing-text-muted">
          <Camera className="h-3.5 w-3.5" /> Photographic evidence
        </p>
        <div className="grid grid-cols-3 gap-2">
          {evidenceCategories.map((c) => (
            <span
              key={c}
              className="flex items-center justify-center rounded-lg bg-marketing-bg-light px-2 py-2 text-center text-[0.7rem] font-medium text-marketing-text-secondary"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl bg-marketing-bg-light px-4 py-3">
        <PenLine className="h-4 w-4 text-marketing-primary" />
        <span className="text-sm font-medium text-marketing-text">Signature captured</span>
        <FileCheck2 className="ml-auto h-4 w-4 text-marketing-success" />
      </div>
    </div>
  );
}
