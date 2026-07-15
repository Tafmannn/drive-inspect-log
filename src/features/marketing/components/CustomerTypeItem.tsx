import type { CustomerType } from "../content/marketingContent";

/** A single customer-category chip. */
export function CustomerTypeItem({ item }: { item: CustomerType }) {
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-marketing-border bg-white px-4 py-2.5 shadow-marketing-sm">
      <Icon className="h-4 w-4 text-marketing-primary" aria-hidden="true" />
      <span className="whitespace-nowrap text-sm font-medium text-marketing-text">{item.label}</span>
    </div>
  );
}
