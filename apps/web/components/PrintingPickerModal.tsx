'use client';

import { useEffect, useState } from 'react';
import { findPrintingsForOracleAction, type PrintingOption } from '@/app/actions';

/**
 * In-page modal for choosing a card's printing. Shows a grid of printing images
 * (the actual art for each) and applies the selection immediately on click.
 */
const FINISHES = [
  { value: '', label: 'Any finish' },
  { value: 'nonfoil', label: 'Nonfoil' },
  { value: 'foil', label: 'Foil' },
  { value: 'etched', label: 'Etched' },
];

export function PrintingPickerModal({
  oracleId,
  currentPrintingId,
  cardName,
  allowDefault = false,
  allowFinish = false,
  currentFinish = null,
  onSelect,
  onClose,
}: {
  oracleId: string;
  currentPrintingId: string | null;
  cardName: string;
  allowDefault?: boolean;
  /** Show a finish selector; the chosen finish is passed as onSelect's 2nd arg. */
  allowFinish?: boolean;
  currentFinish?: string | null;
  onSelect: (printingId: string | null, finish?: string | null) => void;
  onClose: () => void;
}) {
  const [printings, setPrintings] = useState<PrintingOption[] | null>(null);
  const [finish, setFinish] = useState<string>(currentFinish ?? '');
  const [query, setQuery] = useState('');
  const pick = (printingId: string | null) => onSelect(printingId, allowFinish ? finish || null : undefined);

  const q = query.trim().toLowerCase();
  const shown = (printings ?? []).filter(
    (p) =>
      !q ||
      p.setCode.toLowerCase().includes(q) ||
      p.setName.toLowerCase().includes(q) ||
      p.collectorNumber.toLowerCase().includes(q),
  );
  const ownedCount = (printings ?? []).filter((p) => (p.ownedQty ?? 0) > 0).length;

  const ownedTitle = (p: PrintingOption) =>
    p.ownedByFinish
      ? 'In inventory: ' +
        Object.entries(p.ownedByFinish)
          .map(([f, n]) => `${n} ${f}`)
          .join(', ')
      : '';

  useEffect(() => {
    let active = true;
    findPrintingsForOracleAction(oracleId).then((r) => {
      if (active) setPrintings(r.printings ?? []);
    });
    return () => {
      active = false;
    };
  }, [oracleId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Choose printing — {cardName}</h3>
          <button type="button" className="remove-btn" title="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {allowFinish && (
          <label className="field-label" style={{ marginBottom: 12 }}>
            Finish preference
            <select value={finish} onChange={(e) => setFinish(e.target.value)} style={{ maxWidth: 200 }}>
              {FINISHES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {printings === null ? (
          <p className="muted">Loading printings…</p>
        ) : printings.length === 0 ? (
          <p className="muted">No printings found.</p>
        ) : (
          <>
            <div className="row between wrap" style={{ gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search set or collector # (e.g. LTC, 410)"
                autoComplete="off"
                style={{ flex: 1, minWidth: 200 }}
              />
              {ownedCount > 0 && <span className="muted" style={{ fontSize: 12 }}>{ownedCount} in inventory</span>}
            </div>
            <div className="printing-grid">
              {allowDefault && !q && (
                <button
                  type="button"
                  className={`printing-option ${currentPrintingId === null ? 'selected' : ''}`}
                  onClick={() => pick(null)}
                >
                  <div className="printing-thumb placeholder">Default art</div>
                  <div className="printing-label">Default</div>
                </button>
              )}
              {shown.map((p) => {
                const img = p.imageUris?.small ?? p.imageUris?.normal;
                const owned = (p.ownedQty ?? 0) > 0;
                return (
                  <button
                    key={p.scryfallId}
                    type="button"
                    className={`printing-option ${p.scryfallId === currentPrintingId ? 'selected' : ''} ${owned ? 'owned' : ''}`}
                    onClick={() => pick(p.scryfallId)}
                    title={`${p.setName} · #${p.collectorNumber} · ${p.rarity}${owned ? ` — ${ownedTitle(p)}` : ''}`}
                  >
                    {img ? (
                      <img className="printing-thumb" src={img} alt={p.setName} loading="lazy" />
                    ) : (
                      <div className="printing-thumb placeholder">no image</div>
                    )}
                    {owned && <span className="printing-owned" title={ownedTitle(p)}>✓ {p.ownedQty}</span>}
                    <div className="printing-label">
                      {p.setCode.toUpperCase()} #{p.collectorNumber}
                    </div>
                  </button>
                );
              })}
              {shown.length === 0 && <p className="muted">No printings match “{query}”.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
