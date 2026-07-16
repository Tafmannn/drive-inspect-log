import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PhotoProps {
  src: string;
  alt: string;
  /** Aspect ratio box. Defaults to 3/2 (matches the source assets). */
  ratio?: "3/2" | "16/9" | "4/3" | "1/1";
  /** Dark gradient overlay for text legibility / mood. */
  overlay?: boolean;
  /** Eager-load the hero image; everything else lazy-loads. */
  priority?: boolean;
  rounded?: "xl" | "2xl" | "3xl";
  className?: string;
  children?: ReactNode;
}

const ratioClass: Record<NonNullable<PhotoProps["ratio"]>, string> = {
  "3/2": "aspect-[3/2]",
  "16/9": "aspect-[16/9]",
  "4/3": "aspect-[4/3]",
  "1/1": "aspect-square",
};

/**
 * Framed marketing photo: fixed aspect box (no CLS), object-cover, subtle ring
 * + shadow for a crisp "HD" frame, optional dark overlay and overlaid content.
 */
export function Photo({
  src,
  alt,
  ratio = "3/2",
  overlay = false,
  priority = false,
  rounded = "2xl",
  className,
  children,
}: PhotoProps) {
  const roundedClass = rounded === "3xl" ? "rounded-3xl" : rounded === "xl" ? "rounded-xl" : "rounded-2xl";
  return (
    <div
      className={cn(
        "relative overflow-hidden ring-1 ring-black/5 shadow-marketing-lg",
        roundedClass,
        ratioClass[ratio],
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {overlay && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-marketing-navy/70 via-marketing-navy/10 to-transparent"
        />
      )}
      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}
