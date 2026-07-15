import { MarketingSection } from "../components/MarketingSection";
import { CustomerTypeItem } from "../components/CustomerTypeItem";
import { customerTypes } from "../content/marketingContent";

export function CustomerTypesSection() {
  return (
    <MarketingSection tone="muted" labelledBy="customers-heading">
      <div data-reveal className="text-center">
        <h2
          id="customers-heading"
          className="mx-auto max-w-2xl font-heading text-[clamp(1.6rem,3vw,2.25rem)] font-bold leading-tight text-marketing-text"
        >
          Built for businesses that depend on vehicles arriving properly.
        </h2>
      </div>
      <div data-reveal className="mt-10 flex flex-wrap justify-center gap-3">
        {customerTypes.map((item) => (
          <CustomerTypeItem key={item.key} item={item} />
        ))}
      </div>
    </MarketingSection>
  );
}
