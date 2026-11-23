import type { CSSProperties } from 'react';
import './UKPlate.css';

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
/** Seven glyph positions matched against the supplied FE72 ZZM visual reference. */
const SLOTS = [
  { x: 207, w: 124 }, { x: 334, w: 123 }, { x: 463, w: 122 },
  { x: 587, w: 122 }, { x: 766, w: 114 }, { x: 894, w: 114 },
  { x: 1016, w: 140 },
] as const;

function RegistrationOverlay({ formatted }: { formatted: string }) {
  const compact = formatted.replace(/\s/g, '');
  if (MODERN_REG.test(compact)) {
    return (
      <svg className="axentra-uk-plate__svg" viewBox="0 0 1245 245.3"
        preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        {Array.from(compact).map((char, i) => {
          const slot = SLOTS[i];
          const narrow = char === 'I' || char === '1';
          const width = narrow ? slot.w * 0.65 : slot.w;
          return (
            <text key={i} x={narrow ? slot.x + (slot.w - width) / 2 : slot.x}
              y="203" textLength={width} lengthAdjust="spacingAndGlyphs">{char}</text>
          );
        })}
      </svg>
    );
  }
  return <span className={'axentra-uk-plate__registration' + (compact.length > 7 ? ' axentra-uk-plate__registration--long' : '')}
    aria-hidden="true">{formatted}</span>;
}

export function UKPlate({ reg, size = 'compact', className = '', style }: UKPlateProps) {
  const formatted = formatUKRegistration(reg);
  return (
    <span className={'axentra-uk-plate axentra-uk-plate--' + size + ' ' + className}
      style={style} role="img" aria-label={formatted ? 'Vehicle registration ' + formatted : 'Vehicle registration unavailable'}
      data-testid="axentra-uk-plate" data-registration={formatted}>
      <img src="/assets/axentra-uk-plate.png" className="axentra-uk-plate__art"
        alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
      {formatted && <span className="sr-only" aria-hidden="true">{formatted}</span>}
      {formatted && <RegistrationOverlay formatted={formatted} />}
    </span>
  );
}
