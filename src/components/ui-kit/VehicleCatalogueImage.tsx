/**
 * VehicleCatalogueImage — studio render of the job's vehicle model.
 *
 * Source images follow the Axentra library standard: 3000×2000 transparent
 * PNG, car at 75% width, lowest tyre point at 68% height. The panel crops that
 * canvas to a wide 21:9 window and draws the ground shadow in CSS at the
 * baseline, so every vehicle sits on the same line.
 *
 * Renders nothing when there is no image or it fails to load, so the header
 * falls back to its text-only layout.
 */
import { useState } from "react";
import { vehicleCatalogueImageUrl } from "@/lib/vehicleCatalogueImage";

interface VehicleCatalogueImageProps {
  path?: string | null;
  /** Used for alt text, e.g. "BMW X5". */
  label?: string;
  className?: string;
}

export function VehicleCatalogueImage({ path, label, className }: VehicleCatalogueImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = vehicleCatalogueImageUrl(path);

  if (!url || failed) return null;

  return (
    <div
      data-testid="vehicle-catalogue-image"
      className={`relative overflow-hidden rounded-xl aspect-[21/9] bg-gradient-to-b from-muted/70 via-muted/40 to-muted/10 ${className ?? ""}`}
    >
      {/* Ground shadow at the library baseline (68% of the source canvas). */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[79%] h-[7%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-foreground/25 blur-md"
      />
      <img
        src={url}
        alt={label ? `${label} illustration` : "Vehicle illustration"}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{ objectPosition: "50% 48%" }}
        className={`relative h-full w-full select-none object-cover motion-safe:transition-opacity motion-safe:duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
