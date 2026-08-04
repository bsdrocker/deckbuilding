'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CardHover } from '@/components/CardHover';
import { PrintingPickerModal } from '@/components/PrintingPickerModal';
import type { DeckCard } from '@/lib/types';
import { removeDeckCardAction, updateDeckCardAction } from '../../actions';

const BOARDS = [
  { value: 'mainboard', label: 'Main' },
  { value: 'command', label: 'Command' },
  { value: 'sideboard', label: 'Side' },
  { value: 'maybeboard', label: 'Maybe' },
];

export function DeckCardRow({ deckId, card }: { deckId: string; card: DeckCard }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickingArt, setPickingArt] = useState(false);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const setQuantity = (q: number) => {
    if (q < 0) return;
    run(() => updateDeckCardAction(deckId, card.id, { quantity: q }));
  };

  const imageUrl = card.printing?.imageUris?.normal ?? card.oracle.imageUris?.normal ?? null;

  return (
    <li className="deck-card-row" style={{ opacity: pending ? 0.5 : 1 }}>
      <span className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <span className="qty-stepper">
          <button
            type="button"
            className="step"
            aria-label="Decrease"
            onClick={() => setQuantity(card.quantity - 1)}
            disabled={pending}
          >
            −
          </button>
          <span className="qty-val">{card.quantity}</span>
          <button
            type="button"
            className="step"
            aria-label="Increase"
            onClick={() => setQuantity(card.quantity + 1)}
            disabled={pending}
          >
            +
          </button>
        </span>
        <span className="card-name">
          <CardHover name={card.oracle.name} imageUrl={imageUrl} />
        </span>
      </span>

      <span className="row" style={{ gap: 8 }}>
        <span className="muted mana">{card.oracle.manaCost ?? ''}</span>
        <button
          type="button"
          className="art-btn"
          title="Choose printing (art)"
          aria-label="Choose printing"
          onClick={() => setPickingArt(true)}
          disabled={pending}
        >
          🎨
        </button>
        <select
          className="board-select"
          value={card.board}
          onChange={(e) => run(() => updateDeckCardAction(deckId, card.id, { board: e.target.value }))}
          disabled={pending}
          aria-label="Board"
        >
          {BOARDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="remove-btn"
          aria-label={`Remove ${card.oracle.name}`}
          title="Remove"
          onClick={() => run(() => removeDeckCardAction(deckId, card.id))}
          disabled={pending}
        >
          ×
        </button>
      </span>

      {pickingArt && (
        <PrintingPickerModal
          oracleId={card.oracleId}
          currentPrintingId={card.printingId}
          cardName={card.oracle.name}
          allowDefault
          onClose={() => setPickingArt(false)}
          onSelect={(printingId) => {
            setPickingArt(false);
            if (printingId !== card.printingId) {
              run(() => updateDeckCardAction(deckId, card.id, { printingId }));
            }
          }}
        />
      )}
      {error && <span className="error" style={{ flexBasis: '100%' }}>{error}</span>}
    </li>
  );
}
