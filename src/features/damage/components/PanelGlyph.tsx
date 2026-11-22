/** Small "car door" glyph used next to the selected panel name. */
export function PanelGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 13.5 9.5 7H20v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <path d="M9.5 7 7 13.5h13" />
      <path d="M15 15.5h2.5" strokeLinecap="round" />
    </svg>
  );
}
