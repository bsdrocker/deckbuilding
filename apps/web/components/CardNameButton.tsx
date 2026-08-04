'use client';

import { useState } from 'react';
import { CardHover } from './CardHover';
import { PrintingPickerModal } from './PrintingPickerModal';

/**
 * A card name that shows a hover preview and, on click, opens the printing
 * gallery for the card. Browse-only: selecting a printing just closes the modal
 * (used where there's nothing to mutate, e.g. the card search page).
 */
export function CardNameButton({
  oracleId,
  name,
  imageUrl,
}: {
  oracleId: string;
  name: string;
  imageUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="card-name-btn" title="View printings" onClick={() => setOpen(true)}>
        <CardHover name={name} imageUrl={imageUrl} />
      </button>
      {open && (
        <PrintingPickerModal
          oracleId={oracleId}
          currentPrintingId={null}
          cardName={name}
          onClose={() => setOpen(false)}
          onSelect={() => setOpen(false)}
        />
      )}
    </>
  );
}
