const ORDER = ['W', 'U', 'B', 'R', 'G'];

export function ColorDots({ colors }: { colors: string[] }) {
  const present = ORDER.filter((c) => colors.includes(c));
  if (present.length === 0) return <span className="pill">Colorless</span>;
  return (
    <span className="color-dots">
      {present.map((c) => (
        <span key={c} className={`dot ${c}`} title={c} />
      ))}
    </span>
  );
}
