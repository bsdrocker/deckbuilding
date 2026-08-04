import Link from 'next/link';
import type { PublicDeckSummary } from '@/lib/types';
import { ColorDots } from './ColorDots';

/** A responsive grid of public-deck summary cards, each linking to /d/<shareId>. */
export function PublicDeckGrid({ decks, showAuthor = true }: { decks: PublicDeckSummary[]; showAuthor?: boolean }) {
  if (decks.length === 0) {
    return <p className="muted">No public decks found.</p>;
  }
  return (
    <div className="deck-grid">
      {decks.map((d) => (
        <Link key={d.shareId} href={`/d/${d.shareId}`} className="deck-card">
          <div className="row between" style={{ gap: 8 }}>
            <b className="deck-card-name">{d.name}</b>
            <ColorDots colors={d.colorIdentity} />
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
            <span className="muted">{d.format}</span>
            <span className="pill">{d.cardCount} cards</span>
            {d.status === 'built' && <span className="pill status-built">🔨 built</span>}
          </div>
          {showAuthor && (
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              by {d.authorHandle}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
