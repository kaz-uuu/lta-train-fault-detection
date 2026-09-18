/** Product glyph: two rails and a sleeper. Deliberately not anyone's logo. */
export function Glyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden style={{ display: "block", color: "var(--text)" }}>
      <rect x="0.5" y="0.5" width="17" height="17" fill="none" stroke="currentColor" />
      <line x1="6" y1="3" x2="6" y2="15" stroke="currentColor" />
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" />
      <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" />
    </svg>
  );
}
