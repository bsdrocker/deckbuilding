import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Deck, DeckAnalysis, DeckCard, InventoryDiff } from '@/lib/types';
import { ColorDots } from '@/components/ColorDots';
import { ManaCurve } from '@/components/ManaCurve';
import { AddCardForm } from './AddCardForm';
import { DeckCardRow } from './DeckCardRow';
import { DeckStatusToggle } from './DeckStatusToggle';
import { PrimerSection } from './PrimerSection';

const BOARD_LABELS: Record<string, string> = {
  command: 'Command Zone',
  mainboard: 'Mainboard',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard',
};
const BOARD_ORDER = ['command', 'mainboard', 'sideboard', 'maybeboard'];

function groupByBoard(cards: DeckCard[]) {
  const groups: Record<string, DeckCard[]> = {};
  for (const c of cards) (groups[c.board] ??= []).push(c);
  for (const board of Object.keys(groups)) {
    groups[board]!.sort((a, b) => a.oracle.cmc - b.oracle.cmc || a.oracle.name.localeCompare(b.oracle.name));
  }
  return groups;
}

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deckRes, analysisRes, diffRes] = await Promise.all([
    apiFetch(`/v1/decks/${id}`),
    apiFetch(`/v1/decks/${id}/analysis`),
    apiFetch(`/v1/decks/${id}/inventory-diff`),
  ]);

  if (deckRes.status === 401) redirect('/login');
  if (deckRes.status === 404) notFound();

  const deck = (await deckRes.json()) as Deck;
  const analysis = (await analysisRes.json()) as DeckAnalysis;
  const diff = (await diffRes.json()) as InventoryDiff;
  const groups = groupByBoard(deck.cards);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{deck.name}</h1>
            <ColorDots colors={deck.colorIdentity} />
          </div>
          <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
            <span className="muted">{deck.format}</span>
            {analysis.validation.legal ? (
              <span className="pill ok">legal</span>
            ) : (
              <span className="pill bad">{analysis.validation.issues.length} issue(s)</span>
            )}
            <DeckStatusToggle deckId={deck.id} status={deck.status} />
          </div>
        </div>
        <Link href="/decks" className="btn secondary">
          ← All decks
        </Link>
      </div>

      <div className="deck-layout">
        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <h2>Add a card</h2>
            <AddCardForm deckId={deck.id} />
          </div>

          <PrimerSection deckId={deck.id} primer={deck.primer} />

          <div className="panel">
            {deck.cards.length === 0 ? (
              <p className="muted">No cards yet — add some above.</p>
            ) : (
              BOARD_ORDER.filter((b) => groups[b]?.length).map((board) => (
                <div key={board}>
                  <h3>
                    {BOARD_LABELS[board]} ({groups[board]!.reduce((s, c) => s + c.quantity, 0)})
                  </h3>
                  <ul className="card-list">
                    {groups[board]!.map((c) => (
                      <DeckCardRow key={c.id} deckId={deck.id} card={c} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <h2>Inventory completion</h2>
            <div className="completion">
              <div style={{ width: `${diff.completionPct}%` }} />
            </div>
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="muted">
                {diff.ownedCopies}/{diff.neededCopies} owned
              </span>
              <b>{diff.completionPct}%</b>
            </div>
            <div className="stat" style={{ marginTop: 8 }}>
              <span className="muted">Missing copies</span>
              <b>{diff.missingCopies}</b>
            </div>
            <div className="stat">
              <span className="muted">Owned value</span>
              <b>${diff.ownedValueUsd.toFixed(2)}</b>
            </div>
            <div className="stat">
              <span className="muted">Cost to complete</span>
              <b>${diff.missingValueUsd.toFixed(2)}</b>
            </div>
          </div>

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
            <h3>Types</h3>
            {Object.entries(analysis.stats.typeDistribution)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <div className="stat" key={t}>
                  <span className="muted">{t}</span>
                  <b>{n}</b>
                </div>
              ))}
          </div>

          {!analysis.validation.legal && (
            <div className="panel">
              <h2>Legality issues</h2>
              <ul className="card-list">
                {analysis.validation.issues.map((iss, i) => (
                  <li key={i}>
                    <span className="muted">{iss.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
