'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CardAutocomplete } from '@/components/CardAutocomplete';
import {
  addInventoryDetailedAction,
  findPrintingsByNameAction,
  type PrintingOption,
} from '../actions';

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const FINISH_LABELS: Record<string, string> = { nonfoil: 'Nonfoil', foil: 'Foil', etched: 'Etched' };

export function AddInventoryForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [cardName, setCardName] = useState<string | null>(null);
  const [printings, setPrintings] = useState<PrintingOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [finish, setFinish] = useState('nonfoil');
  const [condition, setCondition] = useState('NM');
  const [language, setLanguage] = useState('en');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = printings.find((p) => p.scryfallId === selectedId);
  const availableFinishes = selected?.finishes.length ? selected.finishes : ['nonfoil'];

  function find(nameArg?: string) {
    const q = (nameArg ?? name).trim();
    if (!q) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await findPrintingsByNameAction(q);
      if (res.error) {
        setError(res.error);
        setPrintings([]);
        setCardName(null);
        return;
      }
      setCardName(res.name ?? q);
      setPrintings(res.printings ?? []);
      const first = res.printings?.[0];
      setSelectedId(first?.scryfallId ?? '');
      setFinish(first?.finishes?.[0] ?? 'nonfoil');
    });
  }

  function add() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const res = await addInventoryDetailedAction({ printingId: selectedId, quantity, finish, condition, language });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage(`Added ${quantity}× ${cardName}`);
      setName('');
      setCardName(null);
      setPrintings([]);
      setSelectedId('');
      setQuantity(1);
      router.refresh();
    });
  }

  return (
    <div className="form-col" style={{ maxWidth: 480 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <CardAutocomplete
          placeholder="Card name"
          style={{ flex: 1 }}
          onValueChange={setName}
          onSelect={(s) => find(s.name)}
        />
        <button type="button" className="secondary" onClick={() => find()} disabled={pending || !name.trim()}>
          {pending ? '…' : 'Find printings'}
        </button>
      </div>

      {printings.length > 0 && (
        <>
          <label className="field-label">
            Printing
            <select value={selectedId} onChange={(e) => {
              setSelectedId(e.target.value);
              const p = printings.find((x) => x.scryfallId === e.target.value);
              setFinish(p?.finishes?.[0] ?? 'nonfoil');
            }}>
              {printings.map((p) => (
                <option key={p.scryfallId} value={p.scryfallId}>
                  {p.setName} · #{p.collectorNumber} · {p.rarity}
                </option>
              ))}
            </select>
          </label>

          <div className="row wrap" style={{ gap: 8 }}>
            <label className="field-label">
              Finish
              <select value={finish} onChange={(e) => setFinish(e.target.value)}>
                {availableFinishes.map((f) => (
                  <option key={f} value={f}>
                    {FINISH_LABELS[f] ?? f}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Condition
              <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Lang
              <input value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: 60 }} />
            </label>
            <label className="field-label">
              Qty
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                style={{ width: 70 }}
              />
            </label>
          </div>

          <button type="button" onClick={add} disabled={pending || !selectedId}>
            {pending ? 'Adding…' : 'Add to inventory'}
          </button>
        </>
      )}

      {error && <div className="error">{error}</div>}
      {message && <div style={{ color: 'var(--accent-2)' }}>{message}</div>}
    </div>
  );
}
