'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CardHover } from '@/components/CardHover';
import { PrintingPickerModal } from '@/components/PrintingPickerModal';
import type { InventoryItem } from '@/lib/types';
import { deleteInventoryAction, updateInventoryAction } from '../actions';

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const FINISHES = ['nonfoil', 'foil', 'etched'];

export function InventoryRow({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickingPrint, setPickingPrint] = useState(false);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <tr style={{ opacity: pending ? 0.5 : 1 }}>
      <td>
        <span className="qty-stepper">
          <button type="button" className="step" onClick={() => run(() => updateInventoryAction(item.id, { quantity: item.quantity - 1 }))} disabled={pending}>
            −
          </button>
          <span className="qty-val">{item.quantity}</span>
          <button type="button" className="step" onClick={() => run(() => updateInventoryAction(item.id, { quantity: item.quantity + 1 }))} disabled={pending}>
            +
          </button>
        </span>
      </td>
      <td>
        <CardHover name={item.printing.oracle.name} imageUrl={item.printing.imageUris?.normal} />
      </td>
      <td>
        <button type="button" className="linklike" title="Change printing" onClick={() => setPickingPrint(true)}>
          {item.printing.setCode.toUpperCase()} #{item.printing.collectorNumber}
        </button>
        {pickingPrint && (
          <PrintingPickerModal
            oracleId={item.printing.oracleId}
            currentPrintingId={item.printing.scryfallId}
            cardName={item.printing.oracle.name}
            onClose={() => setPickingPrint(false)}
            onSelect={(printingId) => {
              setPickingPrint(false);
              if (printingId && printingId !== item.printing.scryfallId) {
                run(() => updateInventoryAction(item.id, { printingId }));
              }
            }}
          />
        )}
      </td>
      <td>
        <select className="board-select" value={item.finish} onChange={(e) => run(() => updateInventoryAction(item.id, { finish: e.target.value }))} disabled={pending}>
          {FINISHES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select className="board-select" value={item.condition} onChange={(e) => run(() => updateInventoryAction(item.id, { condition: e.target.value }))} disabled={pending}>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="muted">${item.totalUsd.toFixed(2)}</td>
      <td className="muted" title="Copies used by your built decks">
        {item.used || '—'}
      </td>
      <td title="Owned copies not committed to built decks">
        {item.free < 0 ? (
          <span className="pill bad" title="Over-allocated: built decks need more than you own">
            {item.free}
          </span>
        ) : (
          <span className={item.free === 0 ? 'muted' : ''}>{item.free}</span>
        )}
      </td>
      <td>
        <button type="button" className="remove-btn" title="Remove" onClick={() => run(() => deleteInventoryAction(item.id))} disabled={pending}>
          ×
        </button>
        {error && <div className="error">{error}</div>}
      </td>
    </tr>
  );
}
