import { cn } from "@/lib/utils";
import { SITE } from "../content/marketingContent";

interface BrandLogoProps {
  /** Render for placement on a dark background (default) or light. */
  tone?: "dark" | "light";
  className?: string;
}

/**
 * Axentra wordmark lockup. Uses the existing brand image asset in /public.
 * On dark surfaces the logo is inverted to read as white; on light surfaces it
 * renders as-is (deep navy).
 */
export function BrandLogo({ tone = "dark", className }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/axentra-app-icon.png"
        alt=""
        width={32}
        height={32}
        aria-hidden="true"
        className="h-8 w-8 rounded-lg object-contain"
      />
      <span
        className={cn(
          "font-heading text-lg font-bold tracking-tight",
          tone === "dark" ? "text-marketing-on-dark" : "text-marketing-navy",
        )}
      >
        {SITE.shortName}
        <span className="font-semibold text-marketing-electric"> Vehicles</span>
      </span>
    </span>
  );
}
