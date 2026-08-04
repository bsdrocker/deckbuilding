'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteDeckAction } from '../actions';

/**
 * Deletes a deck after an inline two-step confirm (native window.confirm is
 * suppressed in some embedded webviews, so we never rely on it). Deleting a
 * deck never touches inventory — only the deck and its card list go away.
 * `redirectTo` sends the user elsewhere after success (the deck detail page);
 * otherwise the list refreshes in place.
 */
export function DeleteDeckButton({
  deckId,
  deckName,
  redirectTo,
  className = 'btn danger',
  label = 'Delete',
}: {
  deckId: string;
  deckName: string;
  redirectTo?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteDeckAction(deckId);
      if (res.error) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  if (confirming) {
    return (
      <span className="row" style={{ gap: 6 }} title={`Delete "${deckName}"? Inventory is not affected.`}>
        <span className="muted" style={{ fontSize: 12 }}>
          Delete?
        </span>
        <button type="button" className="btn danger" onClick={doDelete} disabled={pending}>
          {pending ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button type="button" className="btn secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </button>
        {error && <span className="error">{error}</span>}
      </span>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setConfirming(true)} title="Delete deck">
        {label}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}
