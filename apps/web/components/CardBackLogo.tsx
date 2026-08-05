/**
 * A stylized playing/Magic-style card back used as the app logo. Original
 * artwork (gold frame + central diamond ornament on a brown panel) — not the
 * copyrighted Wizards of the Coast card back — rendered as inline SVG so it
 * stays crisp at any size and needs no external asset.
 */
export function CardBackLogo({ size = 20 }: { size?: number }) {
  const w = Math.round((size * 30) / 42); // keep the 30:42 card aspect ratio
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 30 42"
      role="img"
      aria-label="Deckbuilding"
      style={{ display: 'inline-block', verticalAlign: 'text-bottom' }}
    >
      <defs>
        <linearGradient id="cardback-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b4e2e" />
          <stop offset="1" stopColor="#3c2a17" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="28" height="40" rx="4" fill="#241610" stroke="#c9a227" strokeWidth="2" />
      <rect x="4.5" y="4.5" width="21" height="33" rx="2.5" fill="url(#cardback-panel)" stroke="#8a6a2e" strokeWidth="1" />
      <path d="M15 11 L22 21 L15 31 L8 21 Z" fill="none" stroke="#e6c65b" strokeWidth="1.6" />
      <circle cx="15" cy="21" r="2.6" fill="#e6c65b" />
    </svg>
  );
}
