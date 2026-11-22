/**
 * Renders one generated vehicle view as crisp vector SVG with real,
 * individually selectable panel paths. Pins are drawn inside the SVG in
 * viewBox units, so they can never drift from their panel when the diagram
 * resizes; they are counter-scaled to stay a constant on-screen size.
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { DiagramView, Material, PanelShape } from "../geometry/views";
import { toPath, type Pt } from "../geometry/poly";
import { resolveTap, type TapResult } from "../hitTest";
import { panelLabel } from "../panels";

export interface DiagramPin {
  key: string;
  number: number;
  x: number;
  y: number;
  active?: boolean;
  /** Recorded on another view: drawn hollow at the panel centre. */
  ghost?: boolean;
  tone?: "default" | "severe";
}

interface Props {
  diagram: DiagramView;
  selectedPanelId?: string | null;
  damagedPanelIds?: ReadonlySet<string>;
  pins?: DiagramPin[];
  onTap?: (result: TapResult, point: Pt) => void;
  onPinTap?: (key: string) => void;
  /** Gallery/QA: print panel ids at their anchors. */
  showPanelIds?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Finger-sized tolerance in CSS px for the snap-to-nearest rule. */
const TAP_TOLERANCE_PX = 14;

function fillFor(m: Material, id: string): string {
  switch (m) {
    case "paint": return `url(#${id}-paint)`;
    case "paintShade": return `url(#${id}-shade)`;
    case "glass": return `url(#${id}-glass)`;
    case "light": return `url(#${id}-light)`;
    case "tail": return `url(#${id}-tail)`;
    case "tyre": return "#2a2e34";
    case "rim": return `url(#${id}-rim)`;
    case "trim": return "#3a414b";
    case "fabric": return `url(#${id}-fabric)`;
    case "bed": return "#4d5560";
    case "plate": return "#fbfbfb";
    case "shadow": return `url(#${id}-shadow)`;
    case "highlight": return "#ffffff";
    case "line": return "none";
  }
}

function VehicleDiagramSvgInner({
  diagram, selectedPanelId, damagedPanelIds, pins = [], onTap, onPinTap,
  showPanelIds, className, ariaLabel,
}: Props) {
  const rid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const vb = diagram.viewBox;
  // viewBox units per CSS pixel (for constant-size pins / tap tolerance).
  const [unit, setUnit] = useState(vb.w / 340);

  const measure = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setUnit(Math.max(vb.w / r.width, vb.h / r.height));
  }, [vb.w, vb.h]);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onTap) return;
    const el = svgRef.current;
    const ctm = el?.getScreenCTM?.();
    if (!el || !ctm || typeof DOMPoint === "undefined") {
      // No layout (e.g. assistive tech activation or a test DOM): fall back to
      // the panel element itself that received the event.
      const id = (e.target as Element).closest?.("[data-panel-id]")?.getAttribute("data-panel-id");
      const shape = id ? diagram.panels.find((x) => x.id === id) : undefined;
      if (shape) onTap({ panelId: shape.id, candidates: [shape.id], inside: true }, shape.anchor);
      else onTap({ panelId: null, candidates: [], inside: false }, [0, 0]);
      return;
    }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const pt: Pt = [p.x, p.y];
    onTap(resolveTap(diagram, pt, TAP_TOLERANCE_PX * unit), pt);
  };

  const panelStyle = (p: PanelShape): React.SVGProps<SVGPathElement> => {
    const selected = p.id === selectedPanelId;
    const damaged = damagedPanelIds?.has(p.id);
    if (selected) {
      return {
        fill: p.material === "glass" ? `url(#${rid}-selGlass)` : `url(#${rid}-sel)`,
        stroke: "hsl(var(--primary))",
        strokeWidth: 1.6,
      };
    }
    return {
      fill: fillFor(p.material, rid),
      stroke: p.material === "glass" ? "#1d2430" : p.material === "tyre" ? "#1b1e22" : p.material === "light" ? "#6b7a8f" : "#9aa4b1",
      strokeWidth: 0.8,
      ...(damaged ? { filter: undefined } : {}),
    };
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={ariaLabel}
      onClick={handleClick}
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
    >
      <defs>
        <linearGradient id={`${rid}-paint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f2f5f8" />
          <stop offset="1" stopColor="#dfe5ec" />
        </linearGradient>
        <linearGradient id={`${rid}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7ebf0" />
          <stop offset="1" stopColor="#d2d9e1" />
        </linearGradient>
        <linearGradient id={`${rid}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a5668" />
          <stop offset="0.5" stopColor="#2a3340" />
          <stop offset="1" stopColor="#161b22" />
        </linearGradient>
        <linearGradient id={`${rid}-light`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f8fc" />
          <stop offset="0.5" stopColor="#c9d5e3" />
          <stop offset="1" stopColor="#8fa1b7" />
        </linearGradient>
        <linearGradient id={`${rid}-tail`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f26b6b" />
          <stop offset="1" stopColor="#a51d1d" />
        </linearGradient>
        <radialGradient id={`${rid}-rim`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#f5f6f8" />
          <stop offset="1" stopColor="#a9b0bb" />
        </radialGradient>
        <linearGradient id={`${rid}-fabric`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#555c6a" />
          <stop offset="1" stopColor="#30353f" />
        </linearGradient>
        <radialGradient id={`${rid}-shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0f172a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${rid}-sel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.72" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={`${rid}-selGlass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.85" />
          <stop offset="1" stopColor="#0b1f4d" stopOpacity="0.95" />
        </linearGradient>
        {diagram.holes.length > 0 && (
          <clipPath id={`${rid}-arches`} clipPathUnits="userSpaceOnUse">
            <path
              clipRule="evenodd"
              d={`M${vb.x - 50} ${vb.y - 50}h${vb.w + 100}v${vb.h + 100}h${-(vb.w + 100)}Z` + diagram.holes.map(toPath).join("")}
            />
          </clipPath>
        )}
      </defs>

      <g pointerEvents="none">
        {diagram.under.map((s, i) => (
          <path key={i} d={s.d} fill={fillFor(s.material, rid)} opacity={s.opacity} />
        ))}
        {diagram.base.map((s, i) => (
          <path key={i} d={s.d} fill={fillFor(s.material, rid)} stroke="#a7b0bc" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        ))}
      </g>

      <g>
        {diagram.panels.map((p) => (
          <path
            key={p.id}
            d={p.d}
            data-panel-id={p.id}
            className="vd-panel"
            clipPath={diagram.holes.length && p.material !== "tyre" ? `url(#${rid}-arches)` : undefined}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            {...panelStyle(p)}
          >
            <title>{panelLabel(p.id)}</title>
          </path>
        ))}
      </g>

      <g pointerEvents="none">
        {diagram.over.map((s, i) =>
          s.material === "line" ? (
            <path key={i} d={s.d} fill="none" stroke="#7d8794" strokeWidth={0.8} opacity={s.opacity} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          ) : (
            <path key={i} d={s.d} fill={fillFor(s.material, rid)} opacity={s.opacity} stroke={s.material === "plate" ? "#9ca3af" : "none"} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
          ),
        )}
        <path d={diagram.outline} fill="none" stroke="#6f7987" strokeWidth={1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {damagedPanelIds &&
          diagram.panels
            .filter((p) => damagedPanelIds.has(p.id) && p.id !== selectedPanelId)
            .map((p) => (
              <path key={`dmg-${p.id}`} d={p.d} clipPath={diagram.holes.length && p.material !== "tyre" ? `url(#${rid}-arches)` : undefined} fill="hsl(var(--primary))" fillOpacity={0.12} stroke="hsl(var(--primary))" strokeOpacity={0.55} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
            ))}
        {selectedPanelId &&
          diagram.panels
            .filter((p) => p.id === selectedPanelId)
            .map((p) => (
              <path key="sel-outline" d={p.d} clipPath={diagram.holes.length && p.material !== "tyre" ? `url(#${rid}-arches)` : undefined} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            ))}
        {showPanelIds &&
          diagram.panels.map((p) => (
            <text
              key={`lbl-${p.id}`}
              x={p.anchor[0]}
              y={p.anchor[1]}
              fontSize={unit * 7.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#b91c1c"
              stroke="#fff"
              strokeWidth={unit * 2}
              paintOrder="stroke"
            >
              {p.id}
            </text>
          ))}
      </g>

      {pins.map((pin) => (
        <g
          key={pin.key}
          transform={`translate(${pin.x} ${pin.y}) scale(${unit})`}
          onClick={(e) => {
            if (!onPinTap) return;
            e.stopPropagation();
            onPinTap(pin.key);
          }}
          style={{ cursor: onPinTap ? "pointer" : undefined }}
          role={onPinTap ? "button" : undefined}
          aria-label={`Damage ${pin.number}`}
        >
          {/* generous invisible hit target */}
          <circle cx={0} cy={-15} r={17} fill="transparent" />
          {pin.active && <circle cx={0} cy={-15} r={16} fill="hsl(var(--primary))" opacity={0.18} />}
          <path
            d="M0 0 C -3 -6 -11 -9 -11 -16 A 11 11 0 1 1 11 -16 C 11 -9 3 -6 0 0 Z"
            fill={pin.ghost ? "#ffffff" : pin.tone === "severe" ? "#dc2626" : "hsl(var(--primary))"}
            stroke={pin.ghost ? "hsl(var(--primary))" : "#ffffff"}
            strokeWidth={pin.ghost ? 1.6 : 2}
            strokeDasharray={pin.ghost ? "3 2" : undefined}
            style={{ filter: "drop-shadow(0 1px 1.5px rgba(15,23,42,.35))" }}
          />
          <text
            x={0}
            y={-15.5}
            fontSize={11}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
            fill={pin.ghost ? "hsl(var(--primary))" : "#ffffff"}
            style={{ fontFamily: "inherit", pointerEvents: "none" }}
          >
            {pin.number}
          </text>
        </g>
      ))}
    </svg>
  );
}

export const VehicleDiagramSvg = memo(VehicleDiagramSvgInner);
