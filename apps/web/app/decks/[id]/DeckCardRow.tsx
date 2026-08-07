'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CardHover } from '@/components/CardHover';
import { PrintingPickerModal } from '@/components/PrintingPickerModal';
import type { DeckCard, DeckCardAvailability } from '@/lib/types';
import {
  addDeckCardToInventoryAction,
  removeDeckCardAction,
  updateDeckCardAction,
} from '../../actions';

const BOARDS = [
  { value: 'mainboard', label: 'Main' },
  { value: 'command', label: 'Command' },
  { value: 'sideboard', label: 'Side' },
  { value: 'maybeboard', label: 'Maybe' },
];

const FINISHES = [
  { value: '', label: 'Any finish' },
  { value: 'nonfoil', label: 'Nonfoil' },
  { value: 'foil', label: 'Foil' },
  { value: 'etched', label: 'Etched' },
];

export function DeckCardRow({
  deckId,
  card,
  availability,
}: {
  deckId: string;
  card: DeckCard;
  availability?: DeckCardAvailability;
}) {
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

  // Availability flags: red "missing" (own too few copies) takes precedence;
  // otherwise amber "printing/finish not owned" when the pinned printing/finish
  // isn't in inventory even though enough copies of the card are.
  const missing = availability?.missing ?? 0;
  const printingMismatch =
    missing === 0 && availability?.printingStatus === 'not_owned';
  const finishLabel = card.finish ? ` ${card.finish}` : '';
  // Only offer "add to inventory" when there's something to acquire: missing
  // copies, or the pinned printing/finish isn't owned. (Show it too if
  // availability hasn't loaded, so the action is never wrongly hidden.)
  const needsInv = !availability || missing > 0 || availability.printingStatus === 'not_owned';

  return (
    <li className="deck-card-row" style={{ opacity: pending ? 0.5 : 1 }}>
      <span className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <span className="qty-stepper">
          <button type="button" className="step" aria-label="Decrease" onClick={() => setQuantity(card.quantity - 1)} disabled={pending}>
            −
          </button>
          <span className="qty-val">{card.quantity}</span>
          <button type="button" className="step" aria-label="Increase" onClick={() => setQuantity(card.quantity + 1)} disabled={pending}>
            +
          </button>
        </span>
        <button
          type="button"
          className="card-name-btn"
          title="Choose printing (art) & finish"
          onClick={() => setPickingArt(true)}
          disabled={pending}
        >
          <CardHover name={card.oracle.name} imageUrl={imageUrl} />
        </button>
        {missing > 0 && (
          <span className="pill bad" title={`You own ${availability?.ownedOracle ?? 0}; this needs ${card.quantity}.`}>
            missing {missing}
          </span>
        )}
        {printingMismatch && (
          <span
            className="pill warn"
            title={`You own this card but not the pinned printing${finishLabel} in inventory.`}
          >
            printing{finishLabel} not owned
          </span>
        )}
      </span>

      <span className="row" style={{ gap: 8 }}>
        <span className="muted mana">{card.oracle.manaCost ?? ''}</span>
        {needsInv && (
          <button
            type="button"
            className="inv-btn"
            title="Add one copy to inventory"
            aria-label={`Add ${card.oracle.name} to inventory`}
            onClick={() =>
              run(() =>
                addDeckCardToInventoryAction({ oracleId: card.oracleId, printingId: card.printingId, finish: card.finish }),
              )
            }
            disabled={pending}
          >
            ＋inv
          </button>
        )}
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
        <button type="button" className="remove-btn" aria-label={`Remove ${card.oracle.name}`} title="Remove" onClick={() => run(() => removeDeckCardAction(deckId, card.id))} disabled={pending}>
          ×
        </button>
      </span>

      {pickingArt && (
        <PrintingPickerModal
          oracleId={card.oracleId}
          currentPrintingId={card.printingId}
          cardName={card.oracle.name}
          allowDefault
          allowFinish
          currentFinish={card.finish}
          onClose={() => setPickingArt(false)}
          onSelect={(printingId, finish) => {
            setPickingArt(false);
            const finishChanged = (finish ?? null) !== (card.finish ?? null);
            if (printingId !== card.printingId || finishChanged) {
              run(() => updateDeckCardAction(deckId, card.id, { printingId, finish: finish ?? null }));
            }
          }}
        />
      )}
      {error && <span className="error" style={{ flexBasis: '100%' }}>{error}</span>}
    </li>
  );
}
