import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Heading level for correct document outline. Defaults to h2. */
  as?: "h1" | "h2";
  align?: "left" | "center";
  tone?: "light" | "dark";
  id?: string;
  className?: string;
}

/** Consistent eyebrow + heading + intro block used across marketing sections. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  as: Heading = "h2",
  align = "left",
  tone = "light",
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && (
        <p
          className={cn(
            "mb-3 text-xs font-semibold uppercase tracking-[0.18em]",
            tone === "dark" ? "text-marketing-electric" : "text-marketing-primary",
          )}
        >
          {eyebrow}
        </p>
      )}
      <Heading
        id={id}
        className={cn(
          "font-heading font-bold tracking-tight",
          Heading === "h1"
            ? "text-[clamp(2.5rem,6vw,4.75rem)] leading-[1.05]"
            : "text-[clamp(2rem,4vw,3.25rem)] leading-[1.1]",
          tone === "dark" ? "text-marketing-on-dark" : "text-marketing-text",
        )}
      >
        {title}
      </Heading>
      {description && (
        <p
          className={cn(
            "mt-5 text-lg leading-relaxed",
            tone === "dark" ? "text-marketing-on-dark-muted" : "text-marketing-text-secondary",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
