'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CardHover } from '@/components/CardHover';
import type { InventoryItem } from '@/lib/types';
import { deleteInventoryAction, updateInventoryAction } from '../actions';

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const FINISHES = ['nonfoil', 'foil', 'etched'];

export function InventoryRow({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      <td className="muted">
        {item.printing.setCode.toUpperCase()} #{item.printing.collectorNumber}
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
      <td>
        <button type="button" className="remove-btn" title="Remove" onClick={() => run(() => deleteInventoryAction(item.id))} disabled={pending}>
          ×
        </button>
        {error && <div className="error">{error}</div>}
      </td>
    </tr>
  );
}
