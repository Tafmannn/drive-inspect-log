/**
 * Horizontal row of view/filter chips. Scrolls sideways on phones and keeps
 * the selected chip in view (e.g. when a link opens a view far along the row);
 * wraps on desktop.
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function ViewChips<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div
      ref={ref}
      className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5 lg:overflow-visible lg:flex-wrap lg:mx-0 lg:px-0"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <Button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          variant={value === o.value ? "default" : "outline"}
          size="sm"
          className="shrink-0 text-xs h-10 lg:h-8"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
