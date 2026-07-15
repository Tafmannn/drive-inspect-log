import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Faq } from "../content/marketingContent";

/** Accessible FAQ list built on the shared shadcn Accordion (Radix). */
export function FaqAccordion({ items }: { items: Faq[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((faq) => (
        <AccordionItem
          key={faq.key}
          value={faq.key}
          className="border-marketing-border"
        >
          <AccordionTrigger className="text-left font-heading text-base font-semibold text-marketing-text hover:no-underline">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="text-[0.975rem] leading-relaxed text-marketing-text-secondary">
            {faq.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
