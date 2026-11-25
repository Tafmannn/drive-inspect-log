import type { CSSProperties } from 'react';
import './UKPlate.css';
import { layoutPlateGlyphs } from './ukPlateGlyphs';

export type UKPlateSize = 'table' | 'compact' | 'standard' | 'large';

export interface UKPlateProps {
  reg: string | null | undefined;
  /** Kept for existing call-site compatibility; the approved artwork is always yellow. */
  variant?: 'front' | 'rear';
  size?: UKPlateSize;
  className?: string;
  style?: CSSProperties;
}
const MODERN_REG = /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/;
export function formatUKRegistration(reg: string | null | undefined): string {
  const raw = (reg ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const compact = raw.replace(/\s/g, '');
  return MODERN_REG.test(compact) ? compact.slice(0, 4) + ' ' + compact.slice(4) : raw;
}
function RegistrationOverlay({ formatted, layout }: { formatted: string; layout: ReturnType<typeof layoutPlateGlyphs> }) {
  if (!layout) return <span className="axentra-uk-plate__registration" aria-hidden="true">{formatted}</span>;
  return (
    <svg className="axentra-uk-plate__svg" viewBox="0 0 1245 245.3"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <g transform={`translate(${layout.x} ${layout.y}) scale(${layout.scale})`} fill="#000" fillRule="evenodd">
        {layout.placements.map((g, i) => <path key={i} data-glyph={g.char} d={g.d} transform={`translate(${g.x} 0)`} />)}
      </g>
    </svg>
  );
}

export function UKPlate({ reg, size = 'compact', className = '', style }: UKPlateProps) {
  const formatted = formatUKRegistration(reg);
  const layout = formatted ? layoutPlateGlyphs(formatted) : null;
  return (
    <span className={'axentra-uk-plate axentra-uk-plate--' + size + ' ' + className}
      style={style} role="img" aria-label={formatted ? 'Vehicle registration ' + formatted : 'Vehicle registration unavailable'}
      data-testid="axentra-uk-plate" data-registration={formatted}>
      <img src="/assets/axentra-uk-plate.png" className="axentra-uk-plate__art"
        alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
      {formatted && layout && <span className="sr-only" aria-hidden="true">{formatted}</span>}
      {formatted && <RegistrationOverlay formatted={formatted} layout={layout} />}
    </span>
  );
}
