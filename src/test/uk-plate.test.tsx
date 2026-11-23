import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UKPlate, formatUKRegistration } from '../components/UKPlate';
describe('Axentra reference-matched UK plate', () => {
  it('formats modern registration for display only', () => {
    expect(formatUKRegistration('fe72zzm')).toBe('FE72 ZZM');
    expect(formatUKRegistration('BL74FTD')).toBe('BL74 FTD');
    expect(formatUKRegistration('A 1')).toBe('A 1');
  });
  it('renders seven calibrated glyph slots', () => {
    render(<UKPlate reg="FE72ZZM" size="standard" />);
    const element = screen.getByRole('img', { name: 'Vehicle registration FE72 ZZM' });
    expect(Array.from(element.querySelectorAll('svg text')).map(n => n.textContent).join('')).toBe('FE72ZZM');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/assets/axentra-uk-plate.png');
    // Admin/home and portal tests must be able to find the complete registration as text.
    expect(screen.getByText('FE72 ZZM').className).toContain('sr-only');
  });
  it('uses the approved yellow artwork for both legacy variants', () => {
    const { rerender } = render(<UKPlate reg="FE72ZZM" variant="front" />);
    expect(document.querySelector('.axentra-uk-plate__art')?.getAttribute('src')).toBe('/assets/axentra-uk-plate.png');
    rerender(<UKPlate reg="FE72ZZM" variant="rear" />);
    expect(document.querySelector('.axentra-uk-plate__art')?.getAttribute('src')).toBe('/assets/axentra-uk-plate.png');
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
