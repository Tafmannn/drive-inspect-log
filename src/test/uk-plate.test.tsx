import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { layoutPlateGlyphs, PLATE_GLYPHS } from '../components/ukPlateGlyphs';
import { UKPlate, formatUKRegistration } from '../components/UKPlate';
describe('Axentra reference-matched UK plate', () => {
  it('formats modern registration for display only', () => {
    expect(formatUKRegistration('fe72zzm')).toBe('FE72 ZZM');
    expect(formatUKRegistration('BL74FTD')).toBe('BL74 FTD');
    expect(formatUKRegistration('A 1')).toBe('A 1');
  });
  it('renders seven calibrated vector glyphs', () => {
    render(<UKPlate reg="FE72ZZM" size="standard" />);
    const element = screen.getByRole('img', { name: 'Vehicle registration FE72 ZZM' });
    expect(Array.from(element.querySelectorAll('svg path')).map(n => n.getAttribute('data-glyph')).join('')).toBe('FE72ZZM');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/assets/axentra-uk-plate.png');
    // Admin/home and portal tests must be able to find the complete registration as text.
    expect(screen.getByText('FE72 ZZM').className).toContain('sr-only');
  });
  it('matches the reference cap-height and bounding box with no horizontal distortion', () => {
    const l = layoutPlateGlyphs('FE72 ZZM')!;
    expect(l.scale).toBe(1);
    expect(l.x).toBeCloseTo(219, 0);
    expect(l.y).toBe(37);
    expect(l.placements[0].width).toBe(103);
    expect(l.placements[6].width).toBe(117);
    expect(l.placements.map(g => g.x + l.x)).toEqual([219, 345, 471, 594, 772, 900, 1027]);
    expect(l.placements[4].x - l.placements[3].x - l.placements[3].width).toBe(72);
    expect(Object.keys(PLATE_GLYPHS)).toHaveLength(36);
    expect(layoutPlateGlyphs('NU21 YMA')?.scale).toBe(1);
    expect(layoutPlateGlyphs('WW99 WWW')?.scale).toBeLessThan(1);
  });
  it('does not duplicate text for older or nonstandard plates', () => {
    render(<UKPlate reg="LIST9" />);
    expect(screen.getAllByText('LIST9')).toHaveLength(1);
  });
  it('uses the approved yellow artwork for both legacy variants', () => {
    const { rerender } = render(<UKPlate reg="FE72ZZM" variant="front" />);
    expect(document.querySelector('.axentra-uk-plate__art')?.getAttribute('src')).toBe('/assets/axentra-uk-plate.png');
    rerender(<UKPlate reg="FE72ZZM" variant="rear" />);
    expect(document.querySelector('.axentra-uk-plate__art')?.getAttribute('src')).toBe('/assets/axentra-uk-plate.png');
  });
  it('keeps a nonzero intrinsic width in auto-sized flex layouts', () => {
    // jsdom does not calculate flex layout: verify the CSS contract that Chromium
    // needs. width:min(100%,...) computed to 0px in a shrink-wrapped job card.
    const css = readFileSync(resolve(process.cwd(), 'src/components/UKPlate.css'), 'utf8');
    expect(css).toContain('width: var(--axentra-plate-width);');
    expect(css).toContain('max-width: 100%;');
    expect(css).not.toContain('width: min(100%, var(--axentra-plate-width));');
  });

  it('requires both plate assets before release (image must not be missing)', () => {
    const original = resolve(process.cwd(), 'public/assets/axentra-uk-plate-original-4k.png');
    const display = resolve(process.cwd(), 'public/assets/axentra-uk-plate.png');
    expect(existsSync(original)).toBe(true);
    expect(existsSync(display)).toBe(true);
    if (existsSync(original)) {
      expect(createHash('sha256').update(readFileSync(original)).digest('hex'))
        .toBe('9bcb5ec96204510a1c7e06a26631b83c1a9404913b12a85dfd72e9e66ad24d2e');
    }
  });
});
