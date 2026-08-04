'use client';

import { useEffect, useState } from 'react';
import { findPrintingsForOracleAction, type PrintingOption } from '@/app/actions';

/**
 * In-page modal for choosing a card's printing. Shows a grid of printing images
 * (the actual art for each) and applies the selection immediately on click.
 */
export function PrintingPickerModal({
  oracleId,
  currentPrintingId,
  cardName,
  allowDefault = false,
  onSelect,
  onClose,
}: {
  oracleId: string;
  currentPrintingId: string | null;
  cardName: string;
  allowDefault?: boolean;
  onSelect: (printingId: string | null) => void;
  onClose: () => void;
}) {
  const [printings, setPrintings] = useState<PrintingOption[] | null>(null);

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

        {printings === null ? (
          <p className="muted">Loading printings…</p>
        ) : printings.length === 0 ? (
          <p className="muted">No printings found.</p>
        ) : (
          <div className="printing-grid">
            {allowDefault && (
              <button
                type="button"
                className={`printing-option ${currentPrintingId === null ? 'selected' : ''}`}
                onClick={() => onSelect(null)}
              >
                <div className="printing-thumb placeholder">Default art</div>
                <div className="printing-label">Default</div>
              </button>
            )}
            {printings.map((p) => {
              const img = p.imageUris?.small ?? p.imageUris?.normal;
              return (
                <button
                  key={p.scryfallId}
                  type="button"
                  className={`printing-option ${p.scryfallId === currentPrintingId ? 'selected' : ''}`}
                  onClick={() => onSelect(p.scryfallId)}
                  title={`${p.setName} · #${p.collectorNumber} · ${p.rarity}`}
                >
                  {img ? (
                    <img className="printing-thumb" src={img} alt={p.setName} loading="lazy" />
                  ) : (
                    <div className="printing-thumb placeholder">no image</div>
                  )}
                  <div className="printing-label">
                    {p.setCode.toUpperCase()} #{p.collectorNumber}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
