/**
 * Convoy mark: three coupled cars on a rail, the lead car solid. Hairline strokes and square
 * corners on a pixel grid so it stays crisp at 18px. Mirrored in public/favicon.svg.
 */
export function Glyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden style={{ display: "block", color: "var(--text)" }}>
      <rect x="0" y="4" width="4" height="9" fill="currentColor" />
      <rect x="7.5" y="4.5" width="3" height="8" fill="none" stroke="currentColor" />
      <rect x="14.5" y="4.5" width="3" height="8" fill="none" stroke="currentColor" />
      <line x1="4" y1="8.5" x2="7" y2="8.5" stroke="currentColor" />
      <line x1="11" y1="8.5" x2="14" y2="8.5" stroke="currentColor" />
      <line x1="0" y1="15.5" x2="18" y2="15.5" stroke="currentColor" />
    </svg>
  );
}
