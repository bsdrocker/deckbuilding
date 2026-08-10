import type { DeckAnalysis } from '../lib/types';

const BRACKET_NAMES: Record<number, string> = {
  1: 'Exhibition',
  2: 'Core',
  3: 'Upgraded',
  4: 'Optimized',
  5: 'cEDH',
};

function CardGroup({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <>
      <h3>
        {title} ({names.length})
      </h3>
      <ul className="card-list">
        {names.map((n) => (
          <li key={n}>
            <span className="muted">{n}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Commander bracket summary (right-rail panel on deck views). */
export default function BracketPanel({ bracket }: { bracket: NonNullable<DeckAnalysis['bracket']> }) {
  return (
    <div className="panel">
      <h2>Commander bracket</h2>
      <div className="stat">
        <span className="muted">Suggested bracket</span>
        <b>
          {bracket.suggested} — {BRACKET_NAMES[bracket.suggested]}
        </b>
      </div>
      <CardGroup title="Game changers" names={bracket.gameChangers} />
      <CardGroup title="Mass land denial" names={bracket.massLandDenial} />
      <CardGroup title="Extra turns" names={bracket.extraTurns} />
      {bracket.gameChangers.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          No game changers detected.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        {bracket.caveats[0]}
      </p>
    </div>
  );
}
