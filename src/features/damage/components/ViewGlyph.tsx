/** Tiny silhouette of a view, drawn from the same geometry as the diagram. */
import { memo } from "react";
import type { BodyType } from "../bodyTypes";
import { getDiagram, type ViewId } from "../geometry/views";

function ViewGlyphInner({ bodyType, view, className }: { bodyType: BodyType; view: ViewId; className?: string }) {
  const d = getDiagram(bodyType, view);
  const vb = d.viewBox;
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={className} aria-hidden>
      <path d={d.outline} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {d.panels
        .filter((p) => p.material === "glass" || p.material === "tyre")
        .map((p) => (
          <path key={p.id} d={p.d} fill="currentColor" opacity={p.material === "glass" ? 0.35 : 0.8} />
        ))}
    </svg>
  );
}
export const ViewGlyph = memo(ViewGlyphInner);
