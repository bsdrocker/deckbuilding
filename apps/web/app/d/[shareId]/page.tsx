import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { DeckAnalysis, PublicDeck } from '@/lib/types';
import {
  BOARD_LABELS,
  BOARD_ORDER,
  TYPE_LABELS,
  countedTotal,
  groupByBoard,
  groupByType,
} from '@/lib/deckGrouping';
import { CardNameButton } from '@/components/CardNameButton';
import { ColorDots } from '@/components/ColorDots';
import { ManaCurve } from '@/components/ManaCurve';
import { CloneDeckButton } from './CloneDeckButton';

export default async function PublicDeckPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const [deckRes, analysisRes] = await Promise.all([
    apiFetch(`/v1/public/decks/${shareId}`),
    apiFetch(`/v1/public/decks/${shareId}/analysis`),
  ]);

  if (deckRes.status === 404) notFound();
  const deck = (await deckRes.json()) as PublicDeck;
  const analysis = (await analysisRes.json()) as DeckAnalysis;
  const groups = groupByBoard(deck.cards);

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{deck.name}</h1>
            <ColorDots colors={deck.colorIdentity} />
          </div>
          <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
            <span className="muted">{deck.format}</span>
            <span className="muted">·</span>
            <span className="muted">
              by <Link href={`/u/${deck.authorHandle}`}>{deck.authorHandle}</Link>
            </span>
            {analysis.validation.legal ? (
              <span className="pill ok">legal</span>
            ) : (
              <span className="pill bad">{analysis.validation.issues.length} issue(s)</span>
            )}
            <span className="pill">{countedTotal(deck.cards)} cards</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/browse" className="btn secondary">
            ← Browse decks
          </Link>
          <CloneDeckButton shareId={deck.shareId} />
        </div>
      </div>

      <div className="deck-layout">
        <div className="grid" style={{ gap: 16 }}>
          {deck.primer?.trim() && (
            <div className="panel">
              <h2>Primer</h2>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {deck.primer}
              </p>
            </div>
          )}

          <div className="panel">
            {deck.cards.length === 0 ? (
              <p className="muted">This deck has no cards yet.</p>
            ) : (
              BOARD_ORDER.filter((b) => groups[b]?.length).map((board) => (
                <div key={board} className="board-group">
                  <h3>
                    {BOARD_LABELS[board]} ({groups[board]!.reduce((s, c) => s + c.quantity, 0)})
                  </h3>
                  {groupByType(groups[board]!).map((section) => (
                    <div key={section.type} className="type-section">
                      <h4 className="type-heading">
                        {TYPE_LABELS[section.type] ?? section.type} ({section.count})
                      </h4>
                      <ul className="card-list">
                        {section.cards.map((c) => {
                          const imageUrl = c.printing?.imageUris?.normal ?? c.oracle.imageUris?.normal ?? null;
                          return (
                            <li key={c.id} className="deck-card-row">
                              <span className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                                <span className="qty muted">{c.quantity}×</span>
                                <CardNameButton oracleId={c.oracleId} name={c.oracle.name} imageUrl={imageUrl} />
                              </span>
                              <span className="muted mana">{c.oracle.manaCost ?? ''}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <h2>Mana curve</h2>
            <ManaCurve curve={analysis.stats.manaCurve} />
          </div>

          <div className="panel">
            <h2>Stats</h2>
            <div className="stat">
              <span className="muted">Cards</span>
              <b>{analysis.stats.totalCards}</b>
            </div>
            <div className="stat">
              <span className="muted">Lands</span>
              <b>{analysis.stats.landCount}</b>
            </div>
            <div className="stat">
              <span className="muted">Avg. MV (nonland)</span>
              <b>{analysis.stats.averageCmc}</b>
            </div>
            <div className="stat">
              <span className="muted">Est. price</span>
              <b>${analysis.stats.totalPriceUsd.toFixed(2)}</b>
            </div>
            <h3>Color pips</h3>
            {Object.entries(analysis.stats.colorPercentages)
              .filter(([, v]) => v > 0)
              .map(([c, v]) => (
                <div className="stat" key={c}>
                  <span className="row" style={{ gap: 6 }}>
                    <span className={`dot ${c}`} /> {c}
                  </span>
                  <b>{v}%</b>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
